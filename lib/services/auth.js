/**
 * Auth service
 * Handles user authentication and authorization, as well as user management
 * @type {object}
 */
const jwt = require('jsonwebtoken'),
	{ run, r } = require('../utils/db'),
	bcrypt = require('bcrypt'),
	config = require('../config');

class AuthServiceError extends Error {
	constructor(message = 'An unknown error occured', code = 'UNKNOWN') {
		super(message);

		this.name = this.constructor.name;
		this.code = code;

		Error.captureStackTrace(this, this.constructor);
	}
}

function generateAccessToken(user) {
	return jwt.sign({
		exp: Math.floor(Date.now()/1000) + (60*20), // In seconds, 20m expiration
		iss: 'mustachebash',
		sub: user.username,
		role: user.user_role,
		name: user.display_name
	},
	config.jwt.secret);
}

function generateRefreshToken(user) {
	return jwt.sign({
		exp: Math.floor(Date.now()/1000) + (60*60*24*30), // In seconds, 30d expiration
		iss: 'mustachebash',
		aud: 'mustachebash-refresh',
		sub: user.username
	},
	config.jwt.secret);
}

function validateRefreshToken(refreshToken) {
	return jwt.verify(refreshToken, config.jwt.secret, {issuer: 'mustachebash', audience: 'mustachebash-refresh'});
}

module.exports = {
	async authenticateUser(username, password) {
		if(!username || !password) throw new AuthServiceError('Missing username and/or password', 'UNAUTHORIZED');

		const user = await run(r.table('users').get(username));

		if (!user) throw new AuthServiceError('No user found', 'UNAUTHORIZED');

		const authenticated = await bcrypt.compare(password, user.password);

		if(!authenticated) throw new AuthServiceError('Invalid password', 'UNAUTHORIZED');

		const accessToken = generateAccessToken(user);

		let refreshToken;
		try {
			validateRefreshToken(user.refreshToken);

			refreshToken = user.refreshToken;
		} catch(e) {
			refreshToken = generateRefreshToken(user);

			// The resolution of this is not necessarily important to the flow
			run(r.table('admin_users').get(user.username).update({refreshToken}))
				.catch(err => console.error(err));
		}

		return {accessToken, refreshToken};
	},

	async refreshAccessToken(refreshToken) {
		let sub;
		try {
			({ sub } = validateRefreshToken(refreshToken));
		} catch(e) {
			throw new AuthServiceError('Invalid refresh token', 'UNAUTHORIZED');
		}

		const user = await run(r.table('admin_users').get(sub));

		// Revokable refresh tokens
		if(user.refreshToken !== refreshToken) throw new AuthServiceError('Invalid refresh token', 'UNAUTHORIZED');

		return generateAccessToken(user);
	},

	validateAccessToken(accessToken) {
		return jwt.verify(accessToken, config.jwt.secret, {issuer: 'mustachebash'});
	},

	async createUser({ password, username, role = 'doorman' } = {}) {
		if (!password || !username) throw new AuthServiceError('Invalid user parameters', 'INVALID');

		const user = {
			created: r.now(),
			updated: r.now(),
			status: 'active',
			role,
			username
		};

		user.password = await bcrypt.hash(user.password, 10);

		const { generated_keys: [ id ] } = await run(r.table('users').insert(user));

		return id;
	},

	getUsers() {
		return run(r.table('users'))
			.then(cursor => cursor.toArray());
	},

	getUser(username) {
		return run(r.table('users').get(username));
	}
};
