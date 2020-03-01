/**
 * API Router handles entity routing and miscellaneous
 * @type {Express Router}
 */
const api = require('express').Router(),
	{ authorizeUser, requiresPermission } = require('../middleware/auth'),
	{ authenticateUser, refreshAccessToken } = require('../services/auth'),
	{ validateTransactionToken } = require('../services/transactions'),
	{ generateTicketsPDF } = require('../services/pdf'),
	{ getTransactionTickets, checkInWithTicket } = require('../services/guests'),
	transactionsRouter = require('./transactions'),
	sitesRouter = require('./sites'),
	eventsRouter = require('./events'),
	productsRouter = require('./products'),
	promosRouter = require('./promos'),
	guestsRouter = require('./guests'),
	usersRouter = require('./users');

const processTransactionToken = async (req, res, next) => {
	if(!req.query.t) return next(400);

	let transactionId;
	try {
		({ sub: transactionId } = validateTransactionToken(req.query.t));
	} catch(e) {
		next(e);
	}

	try {
		// eslint-disable-next-line
		req.ticketPairs = await getTransactionTickets(transactionId, {status: 'active'});
	} catch(e) {
		if (e.code === 'UNAUTHORIZED') return next(401);

		next(e);
	}

	next();
};

api.use('/transactions', transactionsRouter);
api.use('/sites', sitesRouter);
api.use('/events', authorizeUser, eventsRouter);
api.use('/products', authorizeUser, productsRouter);
api.use('/promos', promosRouter);
api.use('/guests', authorizeUser, guestsRouter);
api.use('/users', authorizeUser, usersRouter);

api.use('/mytickets', processTransactionToken);

api.route('/mytickets')
	.get((req, res) => {
		res.json(req.ticketPairs.map(({ guest, ticket }) => {
			const { confirmationId, firstName, lastName, status: guestStatus } = guest,
				{ qrCode, name: eventName, date: eventDate, status: ticketStatus } = ticket;

			return {
				confirmationId,
				firstName,
				lastName,
				guestStatus,
				eventName,
				eventDate,
				ticketStatus,
				qrCode
			};
		}));
	});

api.route('/mytickets/pdf')
	.get((req, res, next) => {
		try {
			const ticketsPDF = generateTicketsPDF(req.ticketPairs);

			res.setHeader('Content-disposition', 'attachment; filename="Mustache Bash 2020 Tickets.pdf"');
			res.setHeader('Content-type', 'application/pdf');
			ticketsPDF.pipe(res);
			ticketsPDF.end();
		} catch(e) {
			next(e);
		}
	});

api.route('/check-ins')
	.post(authorizeUser, requiresPermission('doorman'), async (req, res, next) => {
		if(!req.body.ticketToken) return next(400);

		try {
			const response = await checkInWithTicket(req.body.ticketToken, req.user.username);

			res.json(response);
		} catch(e) {
			if(e.code === 'TICKET_NOT_FOUND') return next(404);
			if(e.code === 'GUEST_ALREADY_CHECKED_IN') return res.status(409).json(e.context);
			if(e.code === 'EVENT_NOT_ACTIVE') return res.status(410).json(e.context);
			if(e.code === 'EVENT_NOT_STARTED') return res.status(412).json(e.context);
			if(['TICKET_NOT_ACTIVE', 'GUEST_NOT_ACTIVE'].includes(e.code)) return res.status(423).json(e.context);

			next(e);
		}
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

class ClientError extends Error {
	constructor(err, { userAgent }) {
		super(err.message);

		this.name = this.constructor.name;
		this.code = 'CLIENT_ERROR';
		this.userAgent = userAgent;
		this.clientErrorName = err.name;
		this.path = err.path;
		this.filename = err.filename;
		this.lineno = err.lineno;
		this.colno = err.colno;
		this.clientErrorStack = err.stack;
	}
}

api.route('/errors')
	.post((req, res) => {
		const clientError = req.body,
			err = new ClientError(clientError, {userAgent: req.get('User-Agent')});

		req.log.error(err);

		res.status(204).end();
	});

module.exports = api;
