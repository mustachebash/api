/**
 * API Router handles entity routing and miscellaneous
 * @type {Express Router}
 */
const Router = require('@koa/router'),
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

const apiRouter = new Router();

const processTransactionToken = async ctx => {
	if(!ctx.query.t) ctx.throw(400);

	let transactionId;
	try {
		({ sub: transactionId } = validateTransactionToken(ctx.query.t));
	} catch(e) {
		ctx.throw(e);
	}

	try {
		req.ticketPairs = await getTransactionTickets(transactionId);
	} catch(e) {
		if (e.code === 'UNAUTHORIZED') ctx.throw(401);

		ctx.throw(e);
	}

	next();
};

apiRouter.use(transactionsRouter.routes());
apiRouter.use(sitesRouter.routes());
apiRouter.use(eventsRouter.routes());
apiRouter.use(productsRouter.routes());
apiRouter.use(promosRouter.routes());
apiRouter.use(guestsRouter.routes());
apiRouter.use(usersRouter.routes());

apiRouter.use('/mytickets', processTransactionToken);

apiRouter
	.get('/mytickets', (req, res) => {
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

apiRouter
	.get('/mytickets/pdf', (req, res, next) => {
		try {
			const ticketsPDF = generateTicketsPDF(req.ticketPairs);

			res.setHeader('Content-disposition', 'attachment; filename="Mustache Bash 2022 Tickets.pdf"');
			res.setHeader('Content-type', 'application/pdf');
			ticketsPDF.pipe(res);
			ticketsPDF.end();
		} catch(e) {
			ctx.throw(e);
		}
	});

apiRouter
	.post('/check-ins', authorizeUser, requiresPermission('doorman'), async ctx => {
		if(!ctx.request.body.ticketToken) ctx.throw(400);

		try {
			const response = await checkInWithTicket(ctx.request.body.ticketToken, req.user.username);

			return ctx.body = response;
		} catch(e) {
			if(e.code === 'TICKET_NOT_FOUND') ctx.throw(404);
			if(e.code === 'GUEST_ALREADY_CHECKED_IN') return res.status(409).json(e.context);
			if(e.code === 'EVENT_NOT_ACTIVE') return res.status(410).json(e.context);
			if(e.code === 'EVENT_NOT_STARTED') return res.status(412).json(e.context);
			if(['TICKET_NOT_ACTIVE', 'GUEST_NOT_ACTIVE'].includes(e.code)) return res.status(423).json(e.context);

			ctx.throw(e);
		}
	});

apiRouter
	.post('/authenticate', async ctx => {
		if(!ctx.request.body.username || !ctx.request.body.password) ctx.throw(400);

		try {
			const user = await authenticateUser(ctx.request.body.username, ctx.request.body.password);

			return ctx.body = user;
		} catch(e) {
			if (e.code === 'UNAUTHORIZED') ctx.throw(401);

			ctx.throw(e);
		}
	});

apiRouter
	.post('/refresh-access-token', async ctx => {
		if(!ctx.request.body.refreshToken) ctx.throw(403);

		try {
			const accessToken = await refreshAccessToken(ctx.request.body.refreshToken);

			return ctx.body = accessToken;
		} catch(e) {
			if (e.code === 'UNAUTHORIZED') ctx.throw(403);

			ctx.throw(e);
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

apiRouter
	.post('/errors', (req, res) => {
		const clientError = ctx.request.body,
			err = new ClientError(clientError, {userAgent: req.get('User-Agent')});

		req.log.error(err);

		res.status(204).end();
	});

module.exports = apiRouter;
