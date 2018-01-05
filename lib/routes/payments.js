const transactionsRouter = require('express').Router(),
	{ authorizeUser } = require('../middleware/auth'),
	{ createTransaction, getTransactions, getTransaction } = require('../services/transactions'),
	{ sendReceipt } = require('../services/email');

transactionsRouter.route('/')
	.get(authorizeUser, async (req, res, next) => {
		try {
			const transactions = await getTransactions();

			res.json(transactions);
		} catch(e) {
			next(e);
		}
	})
	.post(async (req, res, next) => {
		if(!req.body) return next(400);

		try {
			const transaction = await createTransaction({...req.body});

			// Send a receipt email
			sendReceipt(transaction.first_name, transaction.last_name, transaction.email, transaction.transaction_id, transaction.transaction_amount, transaction.quantity);

			res.status(201).json(transaction.id);
		} catch(e) {
			next(e);
		}
	});

transactionsRouter.route('/:id')
	.get(authorizeUser, async (req, res, next) => {
		try {
			const transaction = await getTransaction(req.params.id);

			if(!transaction) return next(404);

			res.json(transaction);
		} catch(e) {
			next(e);
		}
	});

module.exports = transactionsRouter;
