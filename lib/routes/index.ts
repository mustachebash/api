/**
 * API Router handles entity routing and miscellaneous
 * @type {Express Router}
 */
import Router from '@koa/router';
import { isRecordLike } from '../utils/type-guards.js';
import { authorizeUser, requiresPermission } from '../middleware/auth.js';
import { authenticateGoogleUser, refreshAccessToken } from '../services/auth.js';
import { getEventSettings } from '../services/events.js';
import { validateOrderToken } from '../services/orders.js';
import { checkInWithTicket, getCustomerActiveTicketsByOrderId } from '../services/tickets.js';
import customersRouter from './customers.js';
import ordersRouter from './orders.js';
import transactionsRouter from './transactions.js';
import sitesRouter from './sites.js';
import eventsRouter from './events.js';
import productsRouter from './products.js';
import promosRouter from './promos.js';
import guestsRouter from './guests.js';
import usersRouter from './users.js';
import { getCustomer } from '../services/customers.js';

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

// TODO: add route access to get all current `customer` orders
// /v1/me/orders?token=<customer "access" token>
apiRouter
	.get('/mytickets', async ctx => {
		if(!ctx.query.t || typeof ctx.query.t !== 'string') throw ctx.throw(400);

		let orderId;
		try {
			({ sub: orderId } = validateOrderToken(ctx.query.t));
		} catch(e) {
			throw ctx.throw(e);
		}
		// TODO: make this one large query that returns all the public data needed

		let tickets;
		try {
			tickets = await getCustomerActiveTicketsByOrderId(orderId);
		} catch(e) {
			if (e.code === 'NOT_FOUND') throw ctx.throw(404);

			throw ctx.throw(e);
		}

		let customer;
		try {
			customer = await getCustomer(tickets[0].customerId);
		} catch(e) {
			if (e.code === 'NOT_FOUND') throw ctx.throw(404);

			throw ctx.throw(e);
		}

		return ctx.body = {
			customer: {
				firstName: customer.firstName,
				lastName: customer.lastName,
				email: customer.email
			},
			tickets
		};
	});

apiRouter
	.get('/event-settings/:eventId', async ctx => {
		try {
			const eventSettings = await getEventSettings(ctx.params.eventId);

			return ctx.body = eventSettings;
		} catch(e) {
			if(e.code === 'NOT_FOUND') throw ctx.throw(404);

			throw ctx.throw(e);
		}
	});

apiRouter
	.post('/check-ins', authorizeUser, requiresPermission('doorman'), async ctx => {
		// if(!ctx.request.body.ticketToken) throw ctx.throw(400);

		// try {
		// 	const response = await checkInWithTicket(ctx.request.body.ticketToken, ctx.user.username);

		// 	return ctx.body = response;
		// } catch(e) {
		// 	if(isRecordLike(e)) {
		// 		if(e.code === 'TICKET_NOT_FOUND') throw ctx.throw(404);

		// 		// These codes will trigger a JSON response but 4xx status
		// 		const codeStatuses: Record<string, number> = {
		// 			'GUEST_ALREADY_CHECKED_IN': 409,
		// 			'EVENT_NOT_ACTIVE': 410,
		// 			'EVENT_NOT_STARTED': 412,
		// 			'TICKET_NOT_ACTIVE': 423,
		// 			'GUEST_NOT_ACTIVE': 423
		// 		};
		// 		// For response bodies on errors, we need to manually set the response
		// 		// This will not trigger an error event, or stop upstream propagation
		// 		// if(Object.keys(codeStatuses).includes(e.code)) {
		// 		if(typeof e.code === 'string' && e.code in codeStatuses) {
		// 			ctx.status = codeStatuses[e.code];
		// 			return ctx.body = e.context;
		// 		}
		// 	}

		// 	throw ctx.throw(e);
		// }
	});

apiRouter
	.post('/authenticate', async ctx => {
		const requestBody = ctx.request.body;
		if(!isRecordLike(requestBody)) throw ctx.throw(400);
		if(typeof requestBody.token !== 'string') throw ctx.throw(400);
		if(typeof requestBody.authority !== 'string') throw ctx.throw(400);

		try {
			let user;
			switch(requestBody.authority) {
				case 'google':
					user = await authenticateGoogleUser(requestBody.token);
					break;
			}

			return ctx.body = user;
		} catch(e) {
			if (e.code === 'UNAUTHORIZED') throw ctx.throw(401);

			throw ctx.throw(e);
		}
	});

apiRouter
	.post('/refresh-access-token', async ctx => {
		const requestBody = ctx.request.body;
		if(!isRecordLike(requestBody)) throw ctx.throw(400);
		if(typeof requestBody.refreshToken !== 'string') throw ctx.throw(400);

		try {
			const accessToken = await refreshAccessToken(requestBody.refreshToken);

			ctx.status = 201;
			return ctx.body = {accessToken};
		} catch(e) {
			if (e.code === 'UNAUTHORIZED') throw ctx.throw(403);

			throw ctx.throw(e);
		}
	});

class ClientError extends Error {
	code: string;
	userAgent: string;
	clientErrorName?: string;
	path?: string;
	filename?: string;
	lineno?: string;
	colno?: string;
	clientErrorStack?: string;

	constructor(err: Record<string, string>, { userAgent }: {userAgent: string}) {
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
			err = new ClientError(clientError as Record<string, string>, {userAgent: ctx.get('user-agent')});

		ctx.log.error(err);

		return ctx.status = 204;
	});

export default apiRouter;
