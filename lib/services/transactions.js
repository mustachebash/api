/**
 * Transactions service handles all transaction operations and Braintree
 * @type {object}
 */
const braintree = require('braintree'),
	{ run, r } = require('../utils/db'),
	{ createGuest } = require('../services/guests'),
	{ braintree: btConfig } = require('../config');

const gateway = braintree.connect({
	environment: braintree.Environment[btConfig.environment],
	merchantId: btConfig.merchantId,
	publicKey: btConfig.publicKey,
	privateKey: btConfig.privateKey
});

class TransactionsServiceError extends Error {
	constructor(message = 'An unknown error occured', code = 'UNKNOWN', response) {
		super(message);

		this.name = this.constructor.name;
		this.code = code;
		this.braintreeResponse = response;

		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = {
	getTransactions({ eventId, orderBy = 'created', sort = 'desc' }) {
		let query = r.table('transactions');
		if(eventId) {
			if(Array.isArray(eventId)) {
				query = r.table('products').getAll(...eventId, {index: 'eventId'}).coerceTo('array');
			} else {
				query = r.table('products').getAll(eventId, {index: 'eventId'}).coerceTo('array');
			}

			query = query.do(eventProducts => {
				return r.table('transactions')
					.filter(row => row('order').contains(i => eventProducts('id').contains(i('productId'))));
			});
		}

		// Don't let query params 500
		if(!['asc', 'desc'].includes(sort)) sort = 'asc';

		// Sort
		query = query.orderBy(r[sort](orderBy));

		return run(query).then(cursor => cursor.toArray());
	},

	async createTransaction({ paymentMethodNonce, cart = [], customer = {}, promoId }) {
		// First do some validation
		if (!cart.length || !paymentMethodNonce || !customer.firstName || !customer.lastName || !customer.email) throw new TransactionsServiceError('Invalid payment parameters', 'INVALID');

		const products = await run(r.table('products').getAll(...cart.map(i => i.productId)).filter({status: 'active'})).then(cursor => cursor.toArray());

		let promo;
		if(promoId) {
			promo = await run(r.table('promos').get(promoId));

			if(promo.status !== 'active') throw new TransactionsServiceError('Invalid promo code', 'INVALID');
		}

		// Ensure we have the all the products attempting to be purchased
		if(!products.length || products.length !== cart.length) throw new TransactionsServiceError('Empty/Invalid items in cart', 'INVALID');

		const orderDetails = cart.map(i => {
			const product = products.find(p => p.id === i.productId);

			return {
				...i,
				product
			};
		});

		// We aren't accepting guest names this year
		// Validate we have all the info needed
		// orderDetails.forEach(i => {
		// 	if(i.product.type === 'ticket') {
		// 		if(!i.data || !i.data.guests || i.data.guests.length !== i.quantity) throw new TransactionsServiceError('Missing data for items in cart', 'INVALID');
		// 	}
		// });

		const serviceFee = orderDetails.reduce((tot, i) => {
			if(i.product.type === 'ticket') {
				return tot + (i.quantity * btConfig.serviceFee);
			}

			return tot;
		}, 0);

		let amount = orderDetails.map(i => Number(i.quantity) * i.product.price).reduce((tot, cur) => tot + cur, 0) + serviceFee;

		// Overwrite amount if there's a promo and it sets a price
		if(promo && promo.price) {
			amount = promo.price + serviceFee;
		}

		const response = await gateway.transaction.sale({
			// Get the amount to charge based on the product passed in
			amount,
			paymentMethodNonce: paymentMethodNonce,
			customFields: {
				primary_guest_name: `${customer.firstName} ${customer.lastName}`,
				primary_guest_email: customer.email
			},
			options: {
				submitForSettlement: true
			}
		});

		// Payment transaction errored - try again
		if(!response.success) {
			throw new TransactionsServiceError(`Transaction error: "${response.message}"`, 'UNKNOWN', response);
		}

		const braintreeTransaction = response.transaction,
			btAmount = Number(braintreeTransaction.amount);

		// Package the transaction object
		const transaction = {
			// Assume the first word is the first name, and anything else after is a last name. Sorry Billy Bob
			firstName: customer.firstName,
			lastName: customer.lastName,
			email: customer.email,
			braintreeTransactionId: braintreeTransaction.id,
			braintreeCreatedAt: braintreeTransaction.createdAt,
			// Store this as a number, unless it's NaN, then store 0 (and wonder why it's not a number)
			amount: !Number.isNaN(btAmount) ? btAmount : 0,
			created: r.now(),
			order: cart
		};

		// If a promo was used, mark it as claimed
		if(promoId && promo) {
			transaction.promoId = promoId;

			if(promo.type === 'single-use') run(r.table('promos').get(promoId).update({status: 'claimed'}));
		}

		// Write the transaction to the DB
		const { changes } = await run(r.table('transactions').insert(transaction, {returnChanges: true}));

		// Write all ticketed guests to the DB
		// orderDetails.forEach(i => {
		// 	if(i.product.type === 'ticket') {
		// 		i.data.guests.forEach(g => createGuest({
		// 			...g,
		// 			eventId: i.product.eventId,
		// 			transactionId: changes[0].new_val.id
		// 		}).catch(console.error));
		// 	}
		// });

		// Write a guest with the purchaser's name to the DB
		orderDetails.forEach(i => {
			if(i.product.type === 'ticket') {
				for (let j = 0; j < i.quantity; j++) {
					createGuest({
						firstName: customer.firstName,
						lastName: customer.lastName  + (j > 0 ? ` Guest ${j}` : ''),
						eventId: i.product.eventId,
						transactionId: changes[0].new_val.id,
						confirmationId: braintreeTransaction.id
					}).catch(console.error);
				}
			}
		});

		return changes[0].new_val;
	},

	getTransaction(id) {
		return run(r.table('transactions').get(id));
	}
};
