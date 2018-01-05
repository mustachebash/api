/**
 * Transactions service handles all transaction operations and Braintree
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


class TransactionsServiceError extends Error {
	constructor(message = 'An unknown error occured', code = 'UNKNOWN') {
		super(message);

		this.name = this.constructor.name;
		this.code = code;

		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = {
	getTransactions() {
		return run(r.table('transactions').orderBy(r.asc('last_name'))).then(cursor => cursor.toArray());
	},

	async createTransaction({ paymentMethodNonce, productId, quantity, guest }) {
		// First do some validation
		if (!productId || !paymentMethodNonce) throw new TransactionsServiceError('Invalid payment parameters', 'INVALID');

		let product;
		try {
			product = await run(r.table('products').get(productId));
		} catch(e) {
			throw new TransactionsServiceError('Transaction error', 'UNKNOWN');
		}

		if(!product) throw new TransactionsServiceError('Invalid product sku', 'INVALID');

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

		// Payment transaction errored - try again
		if(!response.success) {
			throw new TransactionsServiceError('Transaction error', 'UNKNOWN');
		}

		const braintreeTransaction = response.transaction;

		// Package the transaction object
		const transaction = {
			// Assume the first word is the first name, and anything else after is a last name. Sorry Billy Bob
			firstName: guest.name.split(' ')[0],
			lastName: guest.name.split(' ').slice(1).join(' '),
			email: guest.email,
			quantity: guest.quantity,
			braintreeTransactionId: braintreeTransaction.id,
			braintreeCreatedAt: braintreeTransaction.createdAt,
			amount: braintreeTransaction.amount,
			created: Date.now(),
			productId
		};

		// Start the basic guests array and add the primary guest
		const guests = [];

		// Do this explicitly
		guests.push({
			first_name: transaction.first_name,
			last_name: transaction.last_name,
			transaction_id: transaction.transaction_id,
			timestamp: transaction.timestamp
		});

		// Write the transaction to the DB
		const { generated_keys: [id] } = await run(r.table('transactions').insert(transaction));

		return id;
	},

	getTransaction(id) {
		return run(r.table('transactions').get(id));
	}
};
