/**
 * Auth service
 * Handles user authentication and authorization, as well as user management
 * @type {object}
 */
import jwt, { JwtPayload } from 'jsonwebtoken';
import { v4 as uuidV4 } from 'uuid';
import { OAuth2Client, TokenPayload} from 'google-auth-library';
import { sql } from '../utils/db.js';
import * as config from '../config.js';

const googleAuthClient = new OAuth2Client();

export type User = {
	id: string;
	displayName: string;
	role: string;
	subClaim: string;
};

class AuthServiceError extends Error {
	code: string;
	context: unknown;

	constructor(message = 'An unknown error occured', code = 'UNKNOWN', context?: unknown) {
		super(message);

		this.name = this.constructor.name;
		this.code = code;
		this.context = context;

		Error.captureStackTrace(this, this.constructor);
	}
}

function generateAccessToken(user: User) {
	return jwt.sign({
		exp: Math.floor(Date.now()/1000) + (60*20), // In seconds, 20m expiration
		iss: 'mustachebash',
		sub: user.id,
		role: user.role,
		name: user.displayName
	},
	config.jwt.secret);
}

function generateRefreshToken(user: User, jti: string) {
	return jwt.sign({
		exp: Math.floor(Date.now()/1000) + (60*60*24*30), // In seconds, 30d expiration
		iss: 'mustachebash',
		aud: 'mustachebash-refresh',
		sub: user.id,
		jti
	},
	config.jwt.secret);
}

function validateRefreshToken(refreshToken: string) {
	return jwt.verify(refreshToken, config.jwt.secret, {issuer: 'mustachebash', audience: 'mustachebash-refresh'});
}

export async function authenticateGoogleUser(token: string) {
	if(!token) throw new AuthServiceError('Missing token', 'UNAUTHORIZED');

	let payload: TokenPayload | undefined, googleUserId: string | null;
	try {
		const ticket = await googleAuthClient.verifyIdToken({
			idToken: token,
			audience: config.google.identityClientId
		});

		payload = ticket.getPayload();
		googleUserId = ticket.getUserId();
	} catch(e) {
		throw new AuthServiceError(e.message, 'UNAUTHORIZED');
	}

	if(!payload || !googleUserId) throw new AuthServiceError('Invalid token', 'UNAUTHORIZED');

	// Only org users are allowed
	if(payload['hd'] !== 'mustachebash.com') throw new AuthServiceError('Invalid email domain', 'UNAUTHORIZED');
	if(['115750122407052152212'].includes(googleUserId)) throw new AuthServiceError('Disallowed user', 'UNAUTHORIZED');

	let user: User;
	try {
		[user] = await sql<User[]>`
			SELECT id, display_name, role, sub_claim
			FROM users
			WHERE sub_claim = ${googleUserId} OR
				(sub_claim IS NULL AND username = ${payload['email'] ?? ''})
		`;
	} catch(e) {
		throw new AuthServiceError('Failed to query for user', 'DB_ERROR', e);
	}

	// Autoinsert the user, since we've verified they're in the org
	if(!user) {
		if(!payload['email'] || !payload['name']) throw new AuthServiceError('Missing user data', 'UNAUTHORIZED');

		try {
			([user] = await sql<User[]>`
				INSERT INTO users (
					id,
					username,
					display_name,
					role,
					sub_claim,
					authority
				) VALUES (
					${uuidV4()},
					${payload['email']},
					${payload['name']},
					'read',
					${googleUserId},
					'google'
				)
				RETURNING id, display_name, role, sub_claim
			`);
		} catch(e) {
			throw new AuthServiceError('Failed to create new user', 'DB_ERROR', e);
		}
	}

	// Update sub claims that haven't been paired yet
	if(user.subClaim === null) {
		await sql`
			UPDATE users
			SET sub_claim = ${googleUserId}, updated = now()
			WHERE id = ${user.id}
		`;
	}

	const accessToken = generateAccessToken(user);

	let refreshToken: string;
	try {
		const jti = uuidV4();
		refreshToken = generateRefreshToken(user, jti);

		await sql`
			UPDATE users
			SET refresh_token_id = ${jti}
			WHERE id = ${user.id}
		`;
	} catch(e) {
		throw new AuthServiceError('Failed to save refreshTokenId', 'DB_ERROR', e);
	}

	return {accessToken, refreshToken};
}

export async function refreshAccessToken(refreshToken: string) {
	let sub: string, jti: string;
	try {
		({ sub, jti } = validateRefreshToken(refreshToken));
	} catch(e) {
		throw new AuthServiceError('Invalid refresh token', 'UNAUTHORIZED');
	}

	let user;
	try {
		[user] = await sql`
			SELECT id, display_name, role, sub_claim, refresh_token_id
			FROM users
			WHERE id = ${sub}
		`;
	} catch(e) {
		throw new AuthServiceError('Failed to query for user', 'DB_ERROR', e);
	}

	// Revokable refresh tokens
	if(user.refreshTokenId !== jti) throw new AuthServiceError('Invalid refresh token', 'UNAUTHORIZED');

	return generateAccessToken(user);
}

export function validateAccessToken(accessToken: string) {
	return jwt.verify(accessToken, config.jwt.secret, {issuer: 'mustachebash'});
}

export function checkScope(userRole: string, scopeRequired: string) {
	const roles = [
		'root',
		'god',
		'admin',
		'write',
		'doorman',
		'read'
	];

	const userLevel = roles.indexOf(userRole);

	return ~userLevel && userLevel <= roles.indexOf(scopeRequired);
}

export async function getUsers() {
	let users;
	try {
		users = await sql`
			SELECT id, username, display_name, role, status, created, updated
			FROM users
		`;
	} catch(e) {
		throw new AuthServiceError('Failed to query for users', 'DB_ERROR', e);
	}

	return users;
}

export async function getUser(id: string) {
	let user;
	try {
		[user] = await sql`
			SELECT id, username, display_name, role, status, created, updated
			FROM users
			WHERE id = ${id}
		`;
	} catch(e) {
		throw new AuthServiceError('Failed to query for user', 'DB_ERROR', e);
	}

	if(!user) throw new AuthServiceError('User does not exist', 'NOT_FOUND');

	return user;
}
