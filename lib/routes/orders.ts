import Router from '@koa/router';
import { authorizeUser, requiresPermission } from '../middleware/auth.js';
import { getOrderTickets, transferTickets } from '../services/tickets.js';
import { createOrder, getOrders, getOrder, getOrderTransfers, refundOrder, generateOrderToken } from '../services/orders.js';
import { sendReceipt, upsertEmailSubscriber, sendTransfereeConfirmation, sendUpgradeReceipt } from '../services/email.js';
import { getTransactions } from '../services/transactions.js';

// TODO: make this configurable at some point
const EMAIL_LIST = '90392ecd5e',
	EMAIL_TAG = 'Mustache Bash 2024 Attendee';

const ordersRouter = new Router({
	prefix: '/orders'
});

ordersRouter
	.get('/', authorizeUser, async ctx => {
		try {
			const orders = await getOrders(ctx.query);

			return ctx.body = orders;
		} catch(e) {
			throw ctx.throw(e);
		}
	})
	.post('/', async ctx => {
		if(!ctx.request.body) throw ctx.throw(400);

		try {
			const { order, transaction, customer } = await createOrder({...ctx.request.body}),
				{ email, firstName, lastName } = customer;

			let orderToken;
			// Quick n dirty logic to check if an upgrade was purchased instead of a ticket
			if(ctx.request.body.targetGuestId) {
				sendUpgradeReceipt(firstName, lastName, email, transaction.processorTransactionId, order.id, order.amount);
			} else {
				try {
					orderToken = await generateOrderToken(order.id);
				} catch(e) {
					ctx.state.log.error(e, 'Error creating order token');
				}

				// Send a receipt email
				sendReceipt(firstName, lastName, email, transaction.processorTransactionId, order.id, orderToken, order.amount);
				// Add them to the mailing list and tag as an attendee
				const emailTags = [EMAIL_TAG];
				if(ctx.request.body.customer.marketingOptIn) emailTags.push('Partner Marketing');
				upsertEmailSubscriber(EMAIL_LIST, {email, firstName, lastName, tags: emailTags});
			}

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${order.id}`);
			ctx.status = 201;
			return ctx.body = {confirmationId: transaction.processorTransactionId, orderId: order.id, token: orderToken};
		} catch(e) {
			if(e.code === 'INVALID') throw ctx.throw(400, e, {expose: false});
			if(e.code === 'GONE') throw ctx.throw(410, e, {expose: false});

			throw ctx.throw(e);
		}
	});

ordersRouter
	.get('/:id', authorizeUser, async ctx => {
		try {
			const order = await getOrder(ctx.params.id);

			if(!order) throw ctx.throw(404);

			return ctx.body = order;
		} catch(e) {
			throw ctx.throw(e);
		}
	})
	.delete('/:id', authorizeUser, async ctx => {
		try {
			const refundDetails = await refundOrder(ctx.params.id, ctx.state.user.id);

			return ctx.body = refundDetails;
		} catch(e) {
			if(e.code === 'NOT_FOUND') throw ctx.throw(404);

			throw ctx.throw(e);
		}
	});

ordersRouter
	.get('/:id/tickets', authorizeUser, async ctx => {
		try {
			const tickets = await getOrderTickets(ctx.params.id);

			ctx.body = tickets;
		} catch(e) {
			if (e.code === 'UNAUTHORIZED') throw ctx.throw(401);

			throw ctx.throw(e);
		}
	});

ordersRouter
	.get('/:id/token', authorizeUser, async ctx => {
		try {
			const orderToken = await generateOrderToken(ctx.params.id);

			return ctx.body = {id: ctx.params.id, token: orderToken};
		} catch(e) {
			if(e.code === 'NOT_FOUND') throw ctx.throw(404);

			throw ctx.throw(e);
		}
	});

ordersRouter
	.get('/:id/transactions', authorizeUser, async ctx => {
		try {
			const transactions = await getTransactions({orderId: ctx.params.id});

			return ctx.body = transactions;
		} catch(e) {
			if(e.code === 'NOT_FOUND') throw ctx.throw(404);

			throw ctx.throw(e);
		}
	});

ordersRouter
	.get('/:id/transfers', authorizeUser, async ctx => {
		try {
			const transfers = await getOrderTransfers(ctx.params.id);

			return ctx.body = transfers;
		} catch(e) {
			if(e.code === 'NOT_FOUND') throw ctx.throw(404);

			throw ctx.throw(e);
		}
	})
	.post('/:id/transfers', authorizeUser, requiresPermission('write'), async ctx => {
		if(!ctx.request.body) throw ctx.throw(400);

		try {
			const { transferee, order } = await transferTickets(ctx.params.id, ctx.request.body, ctx.state.user.id),
				{ email, firstName, lastName } = transferee,
				{ id, parentOrderId } = order;

			let orderToken;
			try {
				orderToken = await generateOrderToken(id);
			} catch(e) {
				ctx.state.log.error(e, 'Error creating order token');
			}

			// Send a transfer email
			sendTransfereeConfirmation(firstName, lastName, email, parentOrderId, orderToken);
			// Add them to the mailing list and tag as an attendee
			upsertEmailSubscriber(EMAIL_LIST, {email, firstName, lastName, tags: [EMAIL_TAG]});

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${id}`);
			ctx.status = 201;
			return ctx.body = {};
		} catch(e) {
			if(e.code === 'INVALID') throw ctx.throw(400, e, {expose: false});
			if(e.code === 'NOT_FOUND') throw ctx.throw(404);

			throw ctx.throw(e);
		}
	});

export default ordersRouter;
