/**
 * Auth service
 * Handles user authentication and authorization, as well as user management
 * @type {object}
 */
const jwt = require('jsonwebtoken'),
	{ v4: uuidV4 } = require('uuid'),
	{ OAuth2Client} = require('google-auth-library'),
	{ sql } = require('../utils/db'),
	bcrypt = require('bcryptjs'),
	config = require('../config');

const googleAuthClient = new OAuth2Client();

class AuthServiceError extends Error {
	constructor(message = 'An unknown error occured', code = 'UNKNOWN', context) {
		super(message);

		this.name = this.constructor.name;
		this.code = code;
		this.context = context;

		Error.captureStackTrace(this, this.constructor);
	}
}

function generateAccessToken(user) {
	return jwt.sign({
		exp: Math.floor(Date.now()/1000) + (60*20), // In seconds, 20m expiration
		iss: 'mustachebash',
		sub: user.id,
		role: user.role,
		name: user.displayName
	},
	config.jwt.secret);
}

function generateRefreshToken(user, jti) {
	return jwt.sign({
		exp: Math.floor(Date.now()/1000) + (60*60*24*30), // In seconds, 30d expiration
		iss: 'mustachebash',
		aud: 'mustachebash-refresh',
		sub: user.id,
		jti
	},
	config.jwt.secret);
}

function validateRefreshToken(refreshToken) {
	return jwt.verify(refreshToken, config.jwt.secret, {issuer: 'mustachebash', audience: 'mustachebash-refresh'});
}

module.exports = {
	async authenticateUser(username, password) {
		if(!username || !password) throw new AuthServiceError('Missing username and/or password', 'UNAUTHORIZED');
		if(!/@mustachebash\.com$/.test(username)) throw new AuthServiceError('Cannot use email/password to log in', 'UNAUTHORIZED');

		let user;
		try {
			[user] = await sql`
				SELECT id, display_name, role, password
				FROM users
				WHERE username = ${username}
			`;
		} catch(e) {
			throw new AuthServiceError('Failed to query for user', 'DB_ERROR', e);
		}

		if (!user) throw new AuthServiceError('No user found', 'UNAUTHORIZED');
		// Prevent users of different authorities from logging in via email/password
		if (user.authority !== 'email') throw new AuthServiceError('Cannot use email/password to log in', 'UNAUTHORIZED');

		const authenticated = await bcrypt.compare(password, user.password);

		if(!authenticated) throw new AuthServiceError('Invalid password', 'UNAUTHORIZED');

		const accessToken = generateAccessToken(user);

		let refreshToken;
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
	},

	async authenticateGoogleUser(token) {
		if(!token) throw new AuthServiceError('Missing token', 'UNAUTHORIZED');

		let payload, googleUserId;
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

		// Only org users are allowed
		if(payload['hd'] !== 'mustachebash.com') throw new AuthServiceError('Invalid email domain', 'UNAUTHORIZED');
		if(['115750122407052152212'].includes(googleUserId)) throw new AuthServiceError('Disallowed user', 'UNAUTHORIZED');

		let user;
		try {
			[user] = await sql`
				SELECT id, display_name, role, sub_claim
				FROM users
				WHERE sub_claim = ${googleUserId} OR
					(sub_claim IS NULL AND username = ${payload['email']})
			`;
		} catch(e) {
			throw new AuthServiceError('Failed to query for user', 'DB_ERROR', e);
		}

		// Autoinsert the user, since we've verified they're in the org
		if(!user) {
			try {
				const newUser = await sql`
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
				`;

				user = newUser[0];
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

		let refreshToken;
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
	},

	async refreshAccessToken(refreshToken) {
		let sub, jti;
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
	},

	validateAccessToken(accessToken) {
		return jwt.verify(accessToken, config.jwt.secret, {issuer: 'mustachebash'});
	},

	checkScope(userRole, scopeRequired) {
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
	},

	async getUsers() {
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
	},

	async getUser(id) {
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
};
