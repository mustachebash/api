import Router from '@koa/router';
import { authorizeUser } from '../middleware/auth.js';
import { getTransactions, getTransaction, getTransactionProcessorDetails } from '../services/transactions.js';
import { AppContext } from '../index.js';
import { isServiceError } from '../utils/type-guards.js';

const transactionsRouter = new Router<AppContext['state'], AppContext>({
	prefix: '/transactions'
});

transactionsRouter.get('/', authorizeUser, async ctx => {
	try {
		const transactions = await getTransactions(ctx.query);

		return (ctx.body = transactions);
	} catch (e) {
		if (e instanceof Error) throw ctx.throw(e);
		throw e;
	}
});

transactionsRouter.get('/:id', authorizeUser, async ctx => {
	try {
		const transaction = await getTransaction(ctx.params.id);

		if (!transaction) throw ctx.throw(404);

		return (ctx.body = transaction);
	} catch (e) {
		if (e instanceof Error) throw ctx.throw(e);
		throw e;
	}
});

transactionsRouter.get('/:id/processor-details', authorizeUser, async ctx => {
	try {
		const processorDetails = await getTransactionProcessorDetails(ctx.params.id);

		return (ctx.body = processorDetails);
	} catch (e) {
		if (isServiceError(e) && e.code === 'NOT_FOUND') throw ctx.throw(404);

		if (e instanceof Error) throw ctx.throw(e);
		throw e;
	}
});

export default transactionsRouter;
