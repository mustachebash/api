/**
 * API Router handles entity routing and miscellaneous
 * @type {Express Router}
 */
const api = require('express').Router(),
	{ authorizeUser } = require('../middleware/auth'),
	{ authenticateUser, refreshAccessToken } = require('../services/auth'),
	transactionsRouter = require('./transactions'),
	guestsRouter = require('./guests'),
	usersRouter = require('./users');

api.use('/transactions', transactionsRouter);
api.use('/guests', authorizeUser, guestsRouter);
api.use('/users', authorizeUser, usersRouter);

api.route('/authenticate')
	.post(async (req, res, next) => {
		if(!req.body.username || !req.body.password) return next(400);

		try {
			const user = await authenticateUser(req.body.username, req.body.password);

			res.json(user);
		} catch(e) {
			if (e.code === 'UNAUTHORIZED') return next(401);

			next(e);
		}
	});

api.route('/refresh-access-token')
	.post(async (req, res, next) => {
		if(!req.body.refreshToken) return next(403);

		try {
			const accessToken = await refreshAccessToken(req.body.refreshToken);

			res.json(accessToken);
		} catch(e) {
			if (e.code === 'UNAUTHORIZED') return next(401);

			next(e);
		}
	});

module.exports = api;
