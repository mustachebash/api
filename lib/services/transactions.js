/**
 * Transactions service handles all transaction operations and Braintree
 * @type {object}
 */
const braintree = require('braintree'),
	{ sql } = require('../utils/db'),
	{ braintree: btConfig } = require('../config');

const gateway = new braintree.BraintreeGateway({
	environment: braintree.Environment[btConfig.environment],
	merchantId: btConfig.merchantId,
	publicKey: btConfig.publicKey,
	privateKey: btConfig.privateKey
});

class TransactionsServiceError extends Error {
	constructor(message = 'An unknown error occured', code = 'UNKNOWN', context) {
		super(message);

		this.name = this.constructor.name;
		this.code = code;
		this.context = context;

		Error.captureStackTrace(this, this.constructor);
	}
}

const transactionColumns = [
	'id',
	'amount',
	'created',
	'type',
	'order_id',
	'processor_transaction_id',
	'processor_created_at',
	'processor',
	'parent_transaction_id',
	'meta'
];

const convertAmountToNumber = o => ({...o, ...(typeof o.amount === 'string' ? {amount: Number(o.amount)} : {})});

module.exports = {
	async getTransactions({ type, orderId, orderBy = 'created', limit, sort = 'desc' }) {
		try {
			const transactions = await sql`
				SELECT ${sql(transactionColumns)}
				FROM transactions
				WHERE 1 = 1
				${orderId ? sql`AND order_id = ${orderId}` : sql``}
				${type ? sql`AND type = ${type}` : sql``}
				ORDER BY ${sql(orderBy)} ${sort === 'desc' ? sql`desc` : sql`asc`}
				${(limit && Number(limit)) ? sql`LIMIT ${limit}` : sql``}
			`;

			return transactions.map(convertAmountToNumber);
		} catch(e) {
			throw new TransactionsServiceError('Could not query transactions', 'UNKNOWN', e);
		}
	},

	async getTransaction(id) {
		let transaction;
		try {
			[transaction] = (await sql`
				SELECT ${sql(transactionColumns)}
				FROM transactions
				WHERE id = ${id}
			`).map(convertAmountToNumber);
		} catch(e) {
			throw new TransactionsServiceError('Could not query transaction', 'UNKNOWN', e);
		}

		if(!transaction) throw new TransactionsServiceError('Transaction not found', 'NOT_FOUND');

		return transaction;
	},

	async getTransactionProcessorDetails(id) {
		let transaction;
		try {
			[transaction] = await sql`
				SELECT processor_transaction_id
				FROM transactions
				WHERE id = ${id}
			`;
		} catch(e) {
			throw new TransactionsServiceError('Could not query transaction', 'UNKNOWN', e);
		}

		if(!transaction) throw new TransactionsServiceError('Transaction not found', 'NOT_FOUND');

		try {
			return {...await gateway.transaction.find(transaction.processorTransactionId), merchantId: btConfig.merchantId};
		} catch(e) {
			throw new TransactionsServiceError('Processor transaction not found', 'BRAINTREE_ERROR', e);
		}
	}
};
