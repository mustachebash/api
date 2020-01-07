const transactionsRouter = require('express').Router(),
	{ authorizeUser } = require('../middleware/auth'),
	{ createTransaction, getTransactions, getTransaction, generateTransactionToken } = require('../services/transactions'),
	{ sendReceipt, upsertEmailSubscriber } = require('../services/email');

// TODO: make this configurable at some point
const EMAIL_LIST = '90392ecd5e',
	EMAIL_TAG = 'Mustache Bash 2020 Attendee';

transactionsRouter.route('/')
	.get(authorizeUser, async (req, res, next) => {
		try {
			const transactions = await getTransactions(req.query);

			res.json(transactions);
		} catch(e) {
			next(e);
		}
	})
	.post(async (req, res, next) => {
		if(!req.body) return next(400);

		try {
			const transaction = await createTransaction({...req.body}),
				{ id, email, firstName, lastName } = transaction;

			let transactionToken;
			try {
				transactionToken = await generateTransactionToken(id);
			} catch(e) {
				req.log.error(e, 'Error creating transaction token');
			}

			// Send a receipt email
			sendReceipt(firstName, lastName, email, transaction.braintreeTransactionId, transactionToken, transaction.amount);
			// Add them to the mailing list and tag as an attendee
			upsertEmailSubscriber(EMAIL_LIST, {email, firstName, lastName, tags: [EMAIL_TAG]});

			res.location(`https://${req.get('host')}${req.baseUrl}/${id}`);
			res.status(201).json({confirmationId: transaction.braintreeTransactionId, token: transactionToken});
		} catch(e) {
			if(e.code === 'INVALID') {
				req.log.error(e);

				return next(400);
			}

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

transactionsRouter.route('/:id/token')
	.get(authorizeUser, async (req, res, next) => {
		try {
			const transactionToken = await generateTransactionToken(req.params.id);

			res.json(transactionToken);
		} catch(e) {
			if(e.code === 'NOT_FOUND') return next(404);

			next(e);
		}
	});

module.exports = transactionsRouter;
