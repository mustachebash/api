import Router from '@koa/router';
import { authorizeUser } from '../middleware/auth.js';
import { getTransactions, getTransaction, getTransactionProcessorDetails } from '../services/transactions.js';

const transactionsRouter = new Router({
	prefix: '/transactions'
});

transactionsRouter
	.get('/', authorizeUser, async ctx => {
		try {
			const transactions = await getTransactions(ctx.query);

			return ctx.body = transactions;
		} catch(e) {
			throw ctx.throw(e);
		}
	});

transactionsRouter
	.get('/:id', authorizeUser, async ctx => {
		try {
			const transaction = await getTransaction(ctx.params.id);

			if(!transaction) throw ctx.throw(404);

			return ctx.body = transaction;
		} catch(e) {
			throw ctx.throw(e);
		}
	});

transactionsRouter
	.get('/:id/processor-details', authorizeUser, async ctx => {
		try {
			const processorDetails = await getTransactionProcessorDetails(ctx.params.id);

			return ctx.body = processorDetails;
		} catch(e) {
			if(e.code === 'NOT_FOUND') throw ctx.throw(404);

			throw ctx.throw(e);
		}
	});

export default transactionsRouter;
