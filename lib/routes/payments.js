const paymentsRouter = require('express').Router(),
	{ authorizeUser } = require('../middleware/auth'),
	{ createPayment, getPayments, getPayment } = require('../services/payments'),
	{ sendReceipt } = require('../services/email');

paymentsRouter.route('/')
	.get(authorizeUser, async (req, res, next) => {
		try {
			const payments = await getPayments();

			res.json(payments);
		} catch(e) {
			next(e);
		}
	})
	.post(async (req, res, next) => {
		if(!req.body) return next(400);

		try {
			const payment = await createPayment({...req.body});

			// Send a receipt email
			sendReceipt(payment.first_name, payment.last_name, payment.email, payment.transaction_id, payment.transaction_amount, payment.quantity);

			res.status(201).json(payment.id);
		} catch(e) {
			next(e);
		}
	});

paymentsRouter.route('/:id')
	.get(authorizeUser, async (req, res, next) => {
		try {
			const payment = await getPayment(req.params.id);

			if(!payment) return next(404);

			res.json(payment);
		} catch(e) {
			next(e);
		}
	});

module.exports = paymentsRouter;
