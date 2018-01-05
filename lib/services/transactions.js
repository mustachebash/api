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

	async createTransaction({ paymentMethodNonce, cartItems, customer }) {
		// First do some validation
		if (!cartItems.length || !paymentMethodNonce) throw new TransactionsServiceError('Invalid payment parameters', 'INVALID');

		const products = await run(r.table('products').getAll(...cartItems.map(i => i.productId)).filter({status: 'active'}));

		// Ensure we have the all the products attempting to be purchased
		if(!products.length || products.length !== cartItems.length) throw new TransactionsServiceError('Empty/Invalid items in cart', 'INVALID');

		const order = cartItems.map(i => {
			const product = products.find(p => p.id === i.productId);

			return {
				...i,
				product
			};
		});

		// If you've made it this far, you've got what you need
		const response = sale({
			// Get the amount to charge based on the product passed in
			amount: order.map(i => Number(i.quantity) * i.product.price).reduce((tot, cur) => tot + cur, 0),
			paymentMethodNonce: paymentMethodNonce,
			customFields: {
				primary_guest_name: customer.name,
				primary_guest_email: customer.email
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
			firstName: customer.name.split(' ')[0],
			lastName: customer.name.split(' ').slice(1).join(' '),
			email: customer.email,
			braintreeTransactionId: braintreeTransaction.id,
			braintreeCreatedAt: braintreeTransaction.createdAt,
			amount: braintreeTransaction.amount,
			created: Date.now(),
			order
		};

		// Write the transaction to the DB
		const { generated_keys: [id] } = await run(r.table('transactions').insert(transaction));

		return id;
	},

	getTransaction(id) {
		return run(r.table('transactions').get(id));
	}
};
