const transactionsRouter = require('express').Router(),
	{ authorizeUser } = require('../middleware/auth'),
	{ getTransactionTickets } = require('../services/guests'),
	{ createTransaction, getTransactions, getTransaction, getTransactionProcessorDetails, refundTransaction, generateTransactionToken } = require('../services/transactions'),
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
	})
	.delete(authorizeUser, async (req, res, next) => {
		try {
			const refundDetails = await refundTransaction(req.params.id, req.user.username);

			res.json(refundDetails);
		} catch(e) {
			if(e.code === 'NOT_FOUND') return next(404);

			next(e);
		}
	});

transactionsRouter.route('/:id/processor-details')
	.get(authorizeUser, async (req, res, next) => {
		try {
			const processorDetails = await getTransactionProcessorDetails(req.params.id);

			res.json(processorDetails);
		} catch(e) {
			if(e.code === 'NOT_FOUND') return next(404);

			next(e);
		}
	});

transactionsRouter.route('/:id/tickets')
	.get(authorizeUser, async (req, res, next) => {
		try {
			const ticketPairs = await getTransactionTickets(req.params.id);

			res.json(ticketPairs.map(({ ticket }) => ticket));
		} catch(e) {
			if (e.code === 'UNAUTHORIZED') return next(401);

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
