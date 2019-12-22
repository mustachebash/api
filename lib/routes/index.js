/**
 * API Router handles entity routing and miscellaneous
 * @type {Express Router}
 */
const api = require('express').Router(),
	{ authorizeUser } = require('../middleware/auth'),
	{ authenticateUser, refreshAccessToken } = require('../services/auth'),
	{ validateTransactionToken } = require('../services/transactions'),
	{ generateTicketsPDF } = require('../services/pdf'),
	{ getTransactionTickets } = require('../services/guests'),
	transactionsRouter = require('./transactions'),
	sitesRouter = require('./sites'),
	eventsRouter = require('./events'),
	productsRouter = require('./products'),
	promosRouter = require('./promos'),
	guestsRouter = require('./guests'),
	usersRouter = require('./users');

api.use('/transactions', transactionsRouter);
api.use('/sites', sitesRouter);
api.use('/events', authorizeUser, eventsRouter);
api.use('/products', authorizeUser, productsRouter);
api.use('/promos', promosRouter);
api.use('/guests', authorizeUser, guestsRouter);
api.use('/users', authorizeUser, usersRouter);

api.route('/mytickets')
	.get(async (req, res, next) => {
		if(!req.query.t) return next(400);

		let transactionId;
		try {
			({ sub: transactionId } = validateTransactionToken(req.query.t));
		} catch(e) {
			next(e);
		}

		let tickets;
		try {
			tickets = await getTransactionTickets(transactionId);
		} catch(e) {
			if (e.code === 'UNAUTHORIZED') return next(401);

			next(e);
		}

		const ticketsPDF = generateTicketsPDF(tickets);

		ticketsPDF.pipe(res);
		ticketsPDF.end();
	});

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
			if (e.code === 'UNAUTHORIZED') return next(403);

			next(e);
		}
	});

module.exports = api;
