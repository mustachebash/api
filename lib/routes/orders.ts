import Router from '@koa/router';
import { authorizeUser, requiresPermission } from '../middleware/auth.js';
import { getOrderTickets, transferTickets } from '../services/tickets.js';
import { createOrder, getOrders, getOrder, getOrderTransfers, refundOrder, generateOrderToken } from '../services/orders.js';
import { sendReceipt, upsertEmailSubscriber, sendTransfereeConfirmation, sendUpgradeReceipt } from '../services/email.js';
import { getTransactions } from '../services/transactions.js';
import { isRecordLike, isServiceError } from '../utils/type-guards.js';
import { validateOrderCreate, validateTransferTickets } from '../utils/validation.js';
import { AppContext } from '../index.js';

// TODO: make this configurable at some point
const EMAIL_LIST = '90392ecd5e',
	EMAIL_TAG = 'Mustache Bash 2027 Attendee';

const ordersRouter = new Router<AppContext['state'], AppContext>({
	prefix: '/orders'
});

ordersRouter
	.get('/', authorizeUser, async ctx => {
		try {
			const orders = await getOrders(ctx.query);

			return (ctx.body = orders);
		} catch (e) {
			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	})
	.post('/', async ctx => {
		const validation = validateOrderCreate(ctx.request.body);
		if (!validation.valid) throw ctx.throw(400, validation.error, { expose: false });

		try {
			const { order, transaction, customer } = await createOrder(validation.data),
				{ email, firstName, lastName } = customer;

			let orderToken;
			// Quick n dirty logic to check if an upgrade was purchased instead of a ticket
			if (validation.data.targetGuestId) {
				sendUpgradeReceipt(firstName, lastName, email, transaction.processorTransactionId, order.id, order.amount);
			} else {
				try {
					orderToken = await generateOrderToken(order.id);
				} catch (e) {
					ctx.state.log.error(e, 'Error creating order token');
				}

				// Send a receipt email
				if (orderToken) {
					sendReceipt(firstName, lastName, email, transaction.processorTransactionId, order.id, orderToken, order.amount);
				}
				// Add them to the mailing list and tag as an attendee
				const emailTags = [EMAIL_TAG];
				if (isRecordLike(ctx.request.body) && isRecordLike(ctx.request.body.customer) && ctx.request.body.customer.marketingOptIn) emailTags.push('Partner Marketing');
				upsertEmailSubscriber(EMAIL_LIST, { email, firstName, lastName, tags: emailTags });
			}

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${order.id}`);
			ctx.status = 201;
			return (ctx.body = { confirmationId: transaction.processorTransactionId, orderId: order.id, token: orderToken });
		} catch (e) {
			if (isServiceError(e) && e.code === 'INVALID') throw ctx.throw(400, e, { expose: false });
			if (isServiceError(e) && e.code === 'GONE') throw ctx.throw(410, e, { expose: false });

			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	});

ordersRouter
	.get('/:id', authorizeUser, async ctx => {
		try {
			const order = await getOrder(ctx.params.id);

			if (!order) throw ctx.throw(404);

			return (ctx.body = order);
		} catch (e) {
			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	})
	.delete('/:id', authorizeUser, async ctx => {
		try {
			await refundOrder(ctx.params.id);

			ctx.status = 204;
			return;
		} catch (e) {
			if (isServiceError(e) && e.code === 'NOT_FOUND') throw ctx.throw(404);

			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	});

ordersRouter.get('/:id/tickets', authorizeUser, async ctx => {
	try {
		const tickets = await getOrderTickets(ctx.params.id);

		ctx.body = tickets;
	} catch (e) {
		if (isServiceError(e) && e.code === 'UNAUTHORIZED') throw ctx.throw(401);

		if (e instanceof Error) throw ctx.throw(e);
		throw e;
	}
});

ordersRouter.get('/:id/token', authorizeUser, async ctx => {
	try {
		const orderToken = await generateOrderToken(ctx.params.id);

		return (ctx.body = { id: ctx.params.id, token: orderToken });
	} catch (e) {
		if (isServiceError(e) && e.code === 'NOT_FOUND') throw ctx.throw(404);

		if (e instanceof Error) throw ctx.throw(e);
		throw e;
	}
});

ordersRouter.get('/:id/transactions', authorizeUser, async ctx => {
	try {
		const transactions = await getTransactions({ orderId: ctx.params.id });

		return (ctx.body = transactions);
	} catch (e) {
		if (isServiceError(e) && e.code === 'NOT_FOUND') throw ctx.throw(404);

		if (e instanceof Error) throw ctx.throw(e);
		throw e;
	}
});

ordersRouter
	.get('/:id/transfers', authorizeUser, async ctx => {
		try {
			const transfers = await getOrderTransfers(ctx.params.id);

			return (ctx.body = transfers);
		} catch (e) {
			if (isServiceError(e) && e.code === 'NOT_FOUND') throw ctx.throw(404);

			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	})
	.post('/:id/transfers', authorizeUser, requiresPermission('write'), async ctx => {
		const validation = validateTransferTickets(ctx.request.body);
		if (!validation.valid) throw ctx.throw(400, validation.error, { expose: false });

		try {
			const { transferee, order } = await transferTickets(ctx.params.id, validation.data),
				{ email, firstName, lastName } = transferee,
				{ id, parentOrderId } = order;

			let orderToken;
			try {
				orderToken = await generateOrderToken(id);
			} catch (e) {
				ctx.state.log.error(e, 'Error creating order token');
			}

			// Send a transfer email
			if (orderToken) {
				sendTransfereeConfirmation(firstName, lastName, email, parentOrderId, orderToken);
			}
			// Add them to the mailing list and tag as an attendee
			upsertEmailSubscriber(EMAIL_LIST, { email, firstName, lastName, tags: [EMAIL_TAG] });

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${id}`);
			ctx.status = 201;
			return (ctx.body = {});
		} catch (e) {
			if (isServiceError(e) && e.code === 'INVALID') throw ctx.throw(400, e, { expose: false });
			if (isServiceError(e) && e.code === 'NOT_FOUND') throw ctx.throw(404);

			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	});

export default ordersRouter;
