/**
 * Transactions service handles all transaction operations and Braintree
 * @type {object}
 */
import braintree from 'braintree';
import { sql } from '../utils/db.js';
import { braintree as btConfig } from '../config.js';

const gateway = new braintree.BraintreeGateway({
	environment: braintree.Environment[btConfig.environment],
	merchantId: btConfig.merchantId,
	publicKey: btConfig.publicKey,
	privateKey: btConfig.privateKey
});

class TransactionsServiceError extends Error {
	code: string;
	context: unknown;

	constructor(message = 'An unknown error occured', code = 'UNKNOWN', context?: unknown) {
		super(message);

		this.name = this.constructor.name;
		this.code = code;
		this.context = context;

		Error.captureStackTrace(this, this.constructor);
	}
}

export type Transaction = {
	id: string;
	amount: number | null;
	created: Date;
	type: 'sale' | 'refund' | 'void';
	orderId: string;
	processorTransactionId: string;
	processorCreatedAt: Date;
	processor: string;
	parentTransactionId: string | null;
	meta: Record<string, unknown>;
};

type TransactionRow = Omit<Transaction, 'amount'> & { amount: string | null };

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

const convertAmountToNumber = (t: TransactionRow): Transaction => ({
	...t,
	amount: t.amount !== null ? Number(t.amount) : null
});

export async function getTransactions({ type, orderId, orderBy = 'created', limit, sort = 'desc' }: { type?: string; orderId?: string; orderBy?: string; limit?: number; sort?: 'asc' | 'desc' } = {}): Promise<Transaction[]> {
	try {
		const transactions = await sql<TransactionRow[]>`
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
}

export async function getTransaction(id: string): Promise<Transaction> {
	let transaction: Transaction | undefined;
	try {
		[transaction] = (await sql<TransactionRow[]>`
			SELECT ${sql(transactionColumns)}
			FROM transactions
			WHERE id = ${id}
		`).map(convertAmountToNumber);
	} catch(e) {
		throw new TransactionsServiceError('Could not query transaction', 'UNKNOWN', e);
	}

	if(!transaction) throw new TransactionsServiceError('Transaction not found', 'NOT_FOUND');

	return transaction;
}

export async function getTransactionProcessorDetails(id: string) {
	let transaction: { processorTransactionId: string } | undefined;
	try {
		[transaction] = await sql<{ processorTransactionId: string }[]>`
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
