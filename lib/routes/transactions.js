const Router = require('@koa/router'),
	{ authorizeUser } = require('../middleware/auth'),
	{ getTransactionTickets } = require('../services/guests'),
	{ createTransaction, getTransactions, getTransaction, getTransactionProcessorDetails, refundTransaction, generateTransactionToken } = require('../services/transactions'),
	{ sendReceipt, upsertEmailSubscriber } = require('../services/email');

// TODO: make this configurable at some point
const EMAIL_LIST = '90392ecd5e',
	EMAIL_TAG = 'Mustache Bash 2020 Attendee';

const transactionsRouter = new Router({
	prefix: '/transactions'
});

transactionsRouter
	.get('/', authorizeUser, async ctx => {
		try {
			const transactions = await getTransactions(ctx.query);

			return ctx.body = transactions;
		} catch(e) {
			ctx.throw(e);
		}
	})
	.post('/', async ctx => {
		if(!ctx.request.body) ctx.throw(400);

		try {
			const transaction = await createTransaction({...ctx.request.body}),
				{ id, email, firstName, lastName } = transaction;

			let transactionToken;
			try {
				transactionToken = await generateTransactionToken(id);
			} catch(e) {
				ctx.log.error(e, 'Error creating transaction token');
			}

			// Send a receipt email
			sendReceipt(firstName, lastName, email, transaction.braintreeTransactionId, transactionToken, transaction.amount);
			// Add them to the mailing list and tag as an attendee
			upsertEmailSubscriber(EMAIL_LIST, {email, firstName, lastName, tags: [EMAIL_TAG]});

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${id}`);
			ctx.status = 201;
			return ctx.body = {confirmationId: transaction.braintreeTransactionId, token: transactionToken};
		} catch(e) {
			if(e.code === 'INVALID') ctx.throw(400, e, {expose: false});

			ctx.throw(e);
		}
	});

transactionsRouter
	.get('/:id', authorizeUser, async ctx => {
		try {
			const transaction = await getTransaction(ctx.params.id);

			if(!transaction) ctx.throw(404);

			return ctx.body = transaction;
		} catch(e) {
			ctx.throw(e);
		}
	})
	.delete('/:id', authorizeUser, async ctx => {
		try {
			const refundDetails = await refundTransaction(ctx.params.id, ctx.user.username);

			return ctx.body = refundDetails;
		} catch(e) {
			if(e.code === 'NOT_FOUND') ctx.throw(404);

			ctx.throw(e);
		}
	});

transactionsRouter
	.get('/:id/processor-details', authorizeUser, async ctx => {
		try {
			const processorDetails = await getTransactionProcessorDetails(ctx.params.id);

			return ctx.body = processorDetails;
		} catch(e) {
			if(e.code === 'NOT_FOUND') ctx.throw(404);

			ctx.throw(e);
		}
	});

transactionsRouter
	.get('/:id/tickets', authorizeUser, async ctx => {
		try {
			const ticketPairs = await getTransactionTickets(ctx.params.id);

			ctx.body = ticketPairs.map(({ ticket }) => ticket);
		} catch(e) {
			if (e.code === 'UNAUTHORIZED') ctx.throw(401);

			ctx.throw(e);
		}
	});

transactionsRouter
	.get('/:id/token', authorizeUser, async ctx => {
		try {
			const transactionToken = await generateTransactionToken(ctx.params.id);

			return ctx.body = transactionToken;
		} catch(e) {
			if(e.code === 'NOT_FOUND') ctx.throw(404);

			ctx.throw(e);
		}
	});

module.exports = transactionsRouter;
