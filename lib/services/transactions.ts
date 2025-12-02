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
	context?: unknown;

	constructor(message = 'An unknown error occured', code = 'UNKNOWN', context?: unknown) {
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

export type Transaction = {
	id: string;
	amount: number;
	created: Date;
	type: string;
	orderId: string;
	processorTransactionId: string;
	processorCreatedAt: Date;
	processor: string;
	parentTransactionId: string | null;
	meta: Record<string, unknown>;
};

type TransactionRaw = Omit<Transaction, 'amount'> & {
	amount: string | number;
};

const convertAmountToNumber = (o: TransactionRaw): Transaction => ({...o, ...(typeof o.amount === 'string' ? {amount: Number(o.amount)} : {})} as Transaction);

type GetTransactionsQuery = {
	type?: string;
	orderId?: string;
	orderBy?: string;
	limit?: number | string;
	sort?: string;
};

export async function getTransactions({ type, orderId, orderBy = 'created', limit, sort = 'desc' }: GetTransactionsQuery = {}): Promise<Transaction[]> {
	try {
		const transactions = await sql<TransactionRaw[]>`
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
		[transaction] = (await sql<TransactionRaw[]>`
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

type TransactionProcessorLookup = {
	processorTransactionId: string;
};

type ProcessorDetails = braintree.Transaction & {
	merchantId: string;
};

export async function getTransactionProcessorDetails(id: string): Promise<ProcessorDetails> {
	let transaction: TransactionProcessorLookup | undefined;
	try {
		[transaction] = await sql<TransactionProcessorLookup[]>`
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
