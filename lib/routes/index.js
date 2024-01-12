/**
 * API Router handles entity routing and miscellaneous
 * @type {Express Router}
 */
const Router = require('@koa/router'),
	{ authorizeUser, requiresPermission } = require('../middleware/auth'),
	{ authenticateUser, authenticateGoogleUser, refreshAccessToken } = require('../services/auth'),
	{ getEventSettings } = require('../services/events'),
	{ validateOrderToken, getOrder } = require('../services/orders'),
	{ getOrderTickets, checkInWithTicket } = require('../services/tickets'),
	customersRouter = require('./customers'),
	ordersRouter = require('./orders'),
	transactionsRouter = require('./transactions'),
	sitesRouter = require('./sites'),
	eventsRouter = require('./events'),
	productsRouter = require('./products'),
	promosRouter = require('./promos'),
	guestsRouter = require('./guests'),
	usersRouter = require('./users');
const { getCustomer } = require('../services/customers');

const apiRouter = new Router();

apiRouter.use(customersRouter.routes());
apiRouter.use(ordersRouter.routes());
apiRouter.use(transactionsRouter.routes());
apiRouter.use(sitesRouter.routes());
apiRouter.use(eventsRouter.routes());
apiRouter.use(productsRouter.routes());
apiRouter.use(promosRouter.routes());
apiRouter.use(guestsRouter.routes());
apiRouter.use(usersRouter.routes());

apiRouter
	.get('/mytickets', async ctx => {
		if(!ctx.query.t) ctx.throw(400);


		let orderId;
		try {
			({ sub: orderId } = validateOrderToken(ctx.query.t));
		} catch(e) {
			ctx.throw(e);
		}
		// TODO: make this one large query that returns all the public data needed

		let order;
		try {
			order = await getOrder(orderId);
		} catch(e) {
			if (e.code === 'NOT_FOUND') ctx.throw(404);

			ctx.throw(e);
		}

		let customer;
		try {
			customer = await getCustomer(order.customerId);
		} catch(e) {
			if (e.code === 'NOT_FOUND') ctx.throw(404);

			ctx.throw(e);
		}

		let tickets;
		try {
			tickets = await getOrderTickets(orderId);
		} catch(e) {
			if (e.code === 'UNAUTHORIZED') ctx.throw(401);

			ctx.throw(e);
		}

		return ctx.body = {
			order: {
				id: order.id,
				created: order.created
			},
			customer: {
				firstName: customer.firstName,
				lastName: customer.lastName,
				email: customer.email
			},
			tickets
		};

		// This original payload had the right idea
		// return ctx.body = tickets.map(({ guest, ticket }) => {
		// 	const { confirmationId, firstName, lastName, status: guestStatus, vip } = guest,
		// 		{ qrCode, name: eventName, date: eventDate, status: ticketStatus } = ticket;

		// 	return {
		// 		confirmationId,
		// 		firstName,
		// 		lastName,
		// 		guestStatus,
		// 		vip,
		// 		eventName,
		// 		eventDate,
		// 		ticketStatus,
		// 		qrCode
		// 	};
		// });
	});

apiRouter
	.get('/event-settings/:eventId', async ctx => {
		try {
			const eventSettings = await getEventSettings(ctx.params.eventId);

			return ctx.body = eventSettings;
		} catch(e) {
			if(e.code === 'NOT_FOUND') ctx.throw(404);

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
		if(
			(!ctx.request.body.username || !ctx.request.body.password) &&
			!ctx.request.body.token
		) ctx.throw(400);

		try {
			let user;
			switch(ctx.request.body.authority) {
				case 'google':
					user = await authenticateGoogleUser(ctx.request.body.token);
					break;

				case 'email':
				default:
					user = await authenticateUser(ctx.request.body.username, ctx.request.body.password);
					break;
			}

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
