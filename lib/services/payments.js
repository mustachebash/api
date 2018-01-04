/**
 * Payments service handles all payment operations and Braintree
 * @type {object}
 */
const { promisify } = require('util'),
	braintree = require('braintree'),
	{ run, r } = require('../utils/db'),
	{ braintree: btConfig } = require('../config');

const gateway = braintree.connect({
		environment: braintree.Environment[btConfig.environment],
		merchantId: btConfig.merchantId,
		publicKey: btConfig.publicKey,
		privateKey: btConfig.privateKey
	}),
	sale = promisify(gateway.transaction.sale);


class PaymentsServiceError extends Error {
	constructor(message = 'An unknown error occured', code = 'UNKNOWN') {
		super(message);

		this.name = this.constructor.name;
		this.code = code;

		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = {
	getPayments() {
		return run(r.table('payments').orderBy(r.asc('last_name'))).then(cursor => cursor.toArray());
	},

	async createPayment({ paymentMethodNonce, sku, quantity, guest }) {
		// First do some validation
		if (!sku || !paymentMethodNonce) throw new PaymentsServiceError('Invalid payment parameters', 'INVALID');

		let product;
		try {
			product = await run(r.table('products').get(sku));
		} catch(e) {
			throw new PaymentsServiceError('Payment error', 'UNKNOWN');
		}

		if(!product) throw new PaymentsServiceError('Invalid product sku', 'INVALID');

		// If you've made it this far, you've got what you need
		const response = sale({
			// Get the amount to charge based on the product passed in
			amount: product.price * quantity,
			paymentMethodNonce: paymentMethodNonce,
			customFields: {
				primary_guest_name: guest.name,
				primary_guest_email: guest.email
			},
			options: {
				submitForSettlement: true
			}
		});

		// Payment tranaction errored - try again
		if(!response.success) {
			throw new PaymentsServiceError('Payment error', 'UNKNOWN');
		}

		const transaction = response.transaction;

		// Package the basic payment object
		const payment = {
			// Assume the first word is the first name, and anything else after is a last name. Sorry Billy Bob
			firstName: guest.name.split(' ')[0],
			lastName: guest.name.split(' ').slice(1).join(' '),
			email: guest.email,
			quantity: guest.quantity,
			transactionId: transaction.id,
			transactionAmount: transaction.amount,
			transactionCreatedAt: transaction.createdAt,
			productSku: sku,
			created: Date.now()
		};

		// Start the basic guests array and add the primary guest
		const guests = [];

		// Do this explicitly
		guests.push({
			first_name: payment.first_name,
			last_name: payment.last_name,
			transaction_id: payment.transaction_id,
			timestamp: payment.timestamp
		});

		// Write the payment to the DB
		const { generated_keys: [id] } = await run(r.table('payments').insert(payment));

		return id;
	},

	getPayment(id) {
		return run(r.table('guests').get(id));
	}
};
