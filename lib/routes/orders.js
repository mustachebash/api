const Router = require('@koa/router'),
	{ authorizeUser, requiresPermission } = require('../middleware/auth'),
	{ getOrderTickets } = require('../services/tickets'),
	{ createOrder, getOrders, getOrder, refundOrder, generateOrderToken, transferOrderTickets } = require('../services/orders'),
	{ sendReceipt, upsertEmailSubscriber, sendTransfereeConfirmation } = require('../services/email');
const { getTransactions } = require('../services/transactions');

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
			ctx.throw(e);
		}
	})
	.post('/', async ctx => {
		if(!ctx.request.body) ctx.throw(400);

		try {
			const { order, transaction, customer } = await createOrder({...ctx.request.body}),
				{ email, firstName, lastName } = customer;

			let orderToken;
			try {
				orderToken = await generateOrderToken(order.id);
			} catch(e) {
				ctx.log.error(e, 'Error creating order token');
			}

			// Send a receipt email
			sendReceipt(firstName, lastName, email, transaction.processorTransactionId, order.id, orderToken, order.amount);
			// Add them to the mailing list and tag as an attendee
			const emailTags = [EMAIL_TAG];
			if(ctx.request.body.customer.marketingOptIn) emailTags.push('Partner Marketing');
			upsertEmailSubscriber(EMAIL_LIST, {email, firstName, lastName, tags: emailTags});

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${order.id}`);
			ctx.status = 201;
			return ctx.body = {confirmationId: transaction.processorTransactionId, orderId: order.id, token: orderToken};
		} catch(e) {
			if(e.code === 'INVALID') ctx.throw(400, e, {expose: false});
			if(e.code === 'GONE') ctx.throw(410, e, {expose: false});

			ctx.throw(e);
		}
	});

ordersRouter
	.get('/:id', authorizeUser, async ctx => {
		try {
			const order = await getOrder(ctx.params.id);

			if(!order) ctx.throw(404);

			return ctx.body = order;
		} catch(e) {
			ctx.throw(e);
		}
	})
	.delete('/:id', authorizeUser, async ctx => {
		try {
			const refundDetails = await refundOrder(ctx.params.id, ctx.user.id);

			return ctx.body = refundDetails;
		} catch(e) {
			if(e.code === 'NOT_FOUND') ctx.throw(404);

			ctx.throw(e);
		}
	});

ordersRouter
	.get('/:id/tickets', authorizeUser, async ctx => {
		try {
			const tickets = await getOrderTickets(ctx.params.id);

			ctx.body = tickets;
		} catch(e) {
			if (e.code === 'UNAUTHORIZED') ctx.throw(401);

			ctx.throw(e);
		}
	});

ordersRouter
	.get('/:id/token', authorizeUser, async ctx => {
		try {
			const orderToken = await generateOrderToken(ctx.params.id);

			return ctx.body = {id: ctx.params.id, token: orderToken};
		} catch(e) {
			if(e.code === 'NOT_FOUND') ctx.throw(404);

			ctx.throw(e);
		}
	});

ordersRouter
	.get('/:id/transactions', authorizeUser, async ctx => {
		try {
			const transactions = await getTransactions({orderId: ctx.params.id});

			return ctx.body = transactions;
		} catch(e) {
			if(e.code === 'NOT_FOUND') ctx.throw(404);

			ctx.throw(e);
		}
	});

ordersRouter
	.post('/:id/transfers', authorizeUser, requiresPermission('write'), async ctx => {
		if(!ctx.request.body) ctx.throw(400);

		try {
			const transfer = await transferOrderTickets(ctx.params.id, ctx.request.body, ctx.user.id),
				{ id, email, firstName, lastName, originalOrderId } = transfer;

			let orderToken;
			try {
				orderToken = await generateOrderToken(id);
			} catch(e) {
				ctx.log.error(e, 'Error creating order token');
			}

			// Send a transfer email
			sendTransfereeConfirmation(firstName, lastName, email, originalOrderId, orderToken);
			// Add them to the mailing list and tag as an attendee
			upsertEmailSubscriber(EMAIL_LIST, {email, firstName, lastName, tags: [EMAIL_TAG]});

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${id}`);
			ctx.status = 201;
			return ctx.body = transfer;
		} catch(e) {
			if(e.code === 'INVALID') ctx.throw(400, e, {expose: false});
			if(e.code === 'NOT_FOUND') ctx.throw(404);

			ctx.throw(e);
		}
	});

module.exports = ordersRouter;
