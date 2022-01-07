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

const processTransactionToken = async (ctx, next) => {
	if(!ctx.query.t) ctx.throw(400);

	let transactionId;
	try {
		({ sub: transactionId } = validateTransactionToken(ctx.query.t));
	} catch(e) {
		ctx.throw(e);
	}

	try {
		ctx.ticketPairs = await getTransactionTickets(transactionId);
	} catch(e) {
		if (e.code === 'UNAUTHORIZED') ctx.throw(401);

		ctx.throw(e);
	}

	await next();
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
	.get('/mytickets', ctx => {
		return ctx.body = ctx.ticketPairs.map(({ guest, ticket }) => {
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
		});
	});

apiRouter
	.get('/mytickets/pdf', ctx => {
		try {
			const ticketsPDF = generateTicketsPDF(ctx.ticketPairs);
			ticketsPDF.end();

			ctx.attachment('Mustache Bash 2022 Tickets.pdf');
			return ctx.body = ticketsPDF;
		} catch(e) {
			ctx.throw(e);
		}
	});

apiRouter
	.post('/check-ins', authorizeUser, requiresPermission('doorman'), async ctx => {
		if(!ctx.request.body.ticketToken) ctx.throw(400);

		try {
			const response = await checkInWithTicket(ctx.request.body.ticketToken, ctx.user.username);

			return ctx.body = response;
		} catch(e) {
			if(e.code === 'TICKET_NOT_FOUND') ctx.throw(404);

			// These codes will trigger a JSON response but 4xx status
			const codeStatuses = {
				'GUEST_ALREADY_CHECKED_IN': 409,
				'EVENT_NOT_ACTIVE': 410,
				'EVENT_NOT_STARTED': 412,
				'TICKET_NOT_ACTIVE': 423,
				'GUEST_NOT_ACTIVE': 423
			};
			// For response bodies on errors, we need to manually set the response
			// This will not trigger an error event, or stop upstream propagation
			if(Object.keys(codeStatuses).includes(e.code)) {
				ctx.status = codeStatuses[e.code];
				return ctx.body = e.context;
			}

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

			ctx.status = 201;
			return ctx.body = {accessToken};
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
	.post('/errors', ctx => {
		const clientError = ctx.request.body,
			err = new ClientError(clientError, {userAgent: ctx.get('user-agent')});

		ctx.log.error(err);

		return ctx.status = 204;
	});

module.exports = apiRouter;
