/**
 * Transactions service handles all transaction operations and Braintree
 * @type {object}
 */
const braintree = require('braintree'),
	jwt = require('jsonwebtoken'),
	log = require('../utils/log'),
	{ run, r } = require('../utils/db'),
	{ createGuest, createGuestTicket } = require('../services/guests'),
	{ braintree: btConfig, donationProductId, jwt: { transactionSecret } } = require('../config');

const gateway = new braintree.BraintreeGateway({
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
	getTransactions({ eventId, productId, orderBy = 'created', sort = 'desc' }) {
		let query = r.table('transactions');
		if(productId) {
			query = r.table('transactions')
				.filter(row => row('order').contains(i => i('productId').eq(productId)));
		} else if(eventId) {
			// TODO: implement this better query
			// r.table('products')
			// 	.getAll(eventId, {index: 'eventId'})
			// 	.innerJoin(r.db('mustachebash').table('transactions'), (product, transaction) => {
			// 		return transaction('order')('productId').contains(product('id'));
			// 	});

			if(Array.isArray(eventId)) {
				query = r.table('products').getAll(...eventId, {index: 'eventId'}).coerceTo('array');
			} else {
				query = r.table('products').getAll(eventId, {index: 'eventId'}).coerceTo('array');
			}

			query = query.do(eventProducts => {
				return r.table('transactions')
					.filter(row => row('order').contains(i => eventProducts('id').contains(i('productId'))))
					.map(row => row.merge({
						transfer: r.table('transactions').get(row('transfereeId').default('NONE'))
					}));
			});
		}

		// Don't let query params 500
		if(!['asc', 'desc'].includes(sort)) sort = 'asc';

		// Sort
		query = query.orderBy(r[sort](orderBy));

		return run(query).then(cursor => cursor.toArray());
	},

	async createTransaction({ paymentMethodNonce, cart = [], customer = {}, promoId, donation }) {
		// First do some validation
		if (!cart.length || !paymentMethodNonce || !customer.firstName || !customer.lastName || !customer.email) throw new TransactionsServiceError('Invalid payment parameters', 'INVALID');

		const products = await run(r.table('products').getAll(...cart.map(i => i.productId)).filter({status: 'active'})).then(cursor => cursor.toArray());

		let promo;
		if(promoId) {
			promo = await run(r.table('promos').get(promoId));

			if(promo.status !== 'active') throw new TransactionsServiceError('Invalid promo code', 'INVALID');
		}

		let promoDonationAmount = 0;
		if(donation) {
			const donationProduct = await run(r.table('products').get(donationProductId));

			products.push(donationProduct);
			cart.push({
				productId: donationProductId,
				quantity: 1
			});

			// Save this price to tack onto promo ticket overrides
			promoDonationAmount = donationProduct.price;
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

		const serviceFee = orderDetails.reduce((tot, i) => {
			if(i.product.type === 'ticket') {
				return tot + (i.quantity * btConfig.serviceFee);
			}

			return tot;
		}, 0);

		const productSubtotal = orderDetails.map(i => Number(i.quantity) * i.product.price).reduce((tot, cur) => tot + cur, 0);

		// We don't sell things for free - if this is 0 and there's no promo, there's a bad purchase attempt
		if(productSubtotal === 0 && (!promo || !promo.price)) throw new TransactionsServiceError('Empty/Invalid items in cart', 'INVALID');

		let amount = productSubtotal + serviceFee;

		// Overwrite amount if there's a promo and it sets a price
		// Include the service fee and any donation amount
		if(promo && promo.price && promo.quantity) {
			amount = (promo.price * promo.quantity) + serviceFee + promoDonationAmount;
		}

		const response = await gateway.transaction.sale({
			// Get the amount to charge based on the product passed in
			amount,
			paymentMethodNonce: paymentMethodNonce,
			customFields: {
				primary_guest_name: `${customer.firstName} ${customer.lastName}`,
				primary_guest_email: customer.email,
				...promoId && {promo_id: promoId}
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

			if(promo.type === 'single-use') run(r.table('promos').get(promoId).update({status: 'claimed', updated: r.now()}));
		}

		// Write the transaction to the DB
		const { changes } = await run(r.table('transactions').insert(transaction, {returnChanges: true}));

		// Write a guest with the purchaser's name to the DB
		orderDetails.forEach(i => {
			if(i.product.type === 'ticket') {
				for (let j = 0; j < i.quantity; j++) {
					(async () => {
						try {
							const { id: guestId } = await createGuest({
								firstName: customer.firstName,
								lastName: customer.lastName  + (j > 0 ? ` Guest ${j}` : ''),
								eventId: i.product.eventId,
								transactionId: changes[0].new_val.id,
								confirmationId: braintreeTransaction.id,
								...i.product.vip && {vip: true}
							});

							await createGuestTicket(guestId);
						} catch(e) {
							log.error(e, 'Error creating guest or ticket');
						}
					})();
				}
			}
		});

		return changes[0].new_val;
	},

	async generateTransactionToken(id) {
		const transaction = await run(r.table('transactions').get(id));

		if(!transaction) throw new TransactionsServiceError('Transaction not found', 'NOT_FOUND');

		return jwt.sign({
			iss: 'mustachebash',
			aud: 'tickets',
			iat: Math.round(transaction.created / 1000),
			sub: id
		},
		transactionSecret);
	},

	validateTransactionToken(token) {
		return jwt.verify(token, transactionSecret, {issuer: 'mustachebash'});
	},

	getTransaction(id) {
		return run(r.table('transactions').get(id));
	},

	async getTransactionProcessorDetails(id) {
		const transaction = await run(r.table('transactions').get(id));

		if(!transaction) throw new TransactionsServiceError('Transaction not found', 'NOT_FOUND');

		try {
			return {...await gateway.transaction.find(transaction.braintreeTransactionId), merchantId: btConfig.merchantId};
		} catch(e) {
			throw new TransactionsServiceError('Transaction not found', 'BRAINTREE_ERROR', e);
		}
	},

	// Full refunds only
	async refundTransaction(id, username) {
		const transaction = await run(r.table('transactions').get(id));

		if(!transaction) throw new TransactionsServiceError('Transaction not found', 'NOT_FOUND');

		let refundResponse, transactionStatus;
		try {
			const {status: processorStatus} = await gateway.transaction.find(transaction.braintreeTransactionId);

			if(['settled', 'settling'].includes(processorStatus)) {
				transactionStatus = 'refunded';
				refundResponse = await gateway.transaction.refund(transaction.braintreeTransactionId);
			} else {
				transactionStatus = 'voided';
				refundResponse = await gateway.transaction.void(transaction.braintreeTransactionId);
			}
		} catch(e) {
			throw new TransactionsServiceError('Transaction not refunded', 'BRAINTREE_ERROR', e);
		}

		// Sometimes the call is successful but the refund is not
		if(!refundResponse.success) throw new TransactionsServiceError('Transaction not refunded', 'BRAINTREE_ERROR', refundResponse);

		// Mark the transaction as refunded in our system, disable the guests and tickets
		try {
			// Synchronize this
			const updated = r.now();
			await Promise.all([
				run(r.table('transactions').get(id).update({status: transactionStatus, updatedBy: username, updated})),
				run(r.table('guests').filter({transactionId: transaction.id}).update({status: 'archived', updatedBy: username, updated})),
				run(r.table('tickets')
					.getAll(
						r.args(r.table('guests').filter({transactionId: transaction.id})('id').coerceTo('array')),
						{index: 'guestId'}
					)
					.update({status: 'disabled', updatedBy: username, updated}))
			]);
		} catch(e) {
			console.error(e);
			throw new TransactionsServiceError('Transaction voiding failed', 'UNKNOWN');
		}

		return refundResponse;
	},

	async transferTransactionTickets(id, transferee, username) {
		const transaction = await run(r.table('transactions').get(id)),
			guests = await run(r.table('guests').filter({transactionId: id})).then(cursor => cursor.toArray());

		if(!transaction) throw new TransactionsServiceError('Transaction not found', 'NOT_FOUND');

		// Create a new transaction for 0 dollars, create guests and tickets
		// Package the transaction object
		const transfereeTransaction = {
			// Assume the first word is the first name, and anything else after is a last name. Sorry Billy Bob
			firstName: transferee.firstName,
			lastName: transferee.lastName,
			email: transferee.email,
			originalTransactionId: transaction.id,
			type: 'transfer',
			amount: 0, // 0 dollar amount because no money was collected
			created: r.now(),
			order: [] // empty array because nothing was purchased
		};

		// Write the transaction to the DB
		const { changes } = await run(r.table('transactions').insert(transfereeTransaction, {returnChanges: true}));

		// Duplicate all original guests but with the transferee's name and id to the DB
		guests.forEach(async (guest, i) => {
			try {
				const { id: guestId } = await createGuest({
					firstName: transferee.firstName,
					lastName: transferee.lastName  + (i > 0 ? ` Guest ${i}` : ''),
					eventId: guest.eventId,
					transactionId: changes[0].new_val.id,
					originalTransactionId: transaction.id,
					confirmationId: transaction.id.substring(0, 8),
					createdBy: 'transfer'
				});

				await createGuestTicket(guestId);
			} catch(e) {
				log.error(e, 'Error creating guest or ticket');
			}
		});

		// Mark the transaction as transferred in our system, disable the guests and tickets
		try {
			// Synchronize this
			const updated = r.now();
			await Promise.all([
				run(r.table('transactions').get(id).update({status: 'transferred', transfereeId: changes[0].new_val.id, updatedBy: username, updated})),
				run(r.table('guests').filter({transactionId: transaction.id}).update({status: 'archived', updatedBy: username, updated})),
				run(r.table('tickets')
					.getAll(
						r.args(r.table('guests').filter({transactionId: transaction.id})('id').coerceTo('array')),
						{index: 'guestId'}
					)
					.update({status: 'disabled', updatedBy: username, updated}))
			]);
		} catch(e) {
			console.error(e);
			throw new TransactionsServiceError('Transaction voiding failed', 'UNKNOWN');
		}

		return changes[0].new_val;
	}
};
