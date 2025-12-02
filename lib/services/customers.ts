/**
 * Customers Service
 * Handles all customer actions
 * @type {Object}
 */
import { sql } from '../utils/db.js';
import { v4 as uuidV4 } from 'uuid';

export class CustomerServiceError extends Error {
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

const customerColumns = [
	'id',
	'email',
	'first_name',
	'last_name',
	'created',
	'updated',
	'updated_by',
	'meta'
];

export type Customer = {
	id: string;
	email: string;
	firstName: string;
	lastName: string;
	created: Date;
	updated: Date;
	updatedBy: string | null;
	meta: Record<string, unknown>;
};

type CreateCustomerInput = {
	firstName: string;
	lastName: string;
	email: string;
	meta?: Record<string, unknown>;
};

export async function createCustomer({ firstName, lastName, email, meta }: CreateCustomerInput): Promise<Customer> {
	if(!firstName || !lastName || !email) throw new CustomerServiceError('Missing customer data', 'INVALID');
	if(!/.+@.+\..{2,}/.test(email)) throw new CustomerServiceError('Invalid email', 'INVALID');

	const customer = {
		id: uuidV4(),
		firstName,
		lastName,
		email,
		meta: {
			...meta
		}
	};

	try {
		const [createdCustomer] = await sql<Customer[]>`
			INSERT INTO customers ${sql(customer)}
			RETURNING ${sql(customerColumns)}
		`;

		return createdCustomer;
	} catch(e) {
		throw new CustomerServiceError('Could not create customer', 'UNKNOWN', e);
	}
}

export async function getCustomers(): Promise<Customer[]> {
	try {
		const customers = await sql<Customer[]>`
			SELECT ${sql(customerColumns)}
			FROM customers
		`;

		return customers;
	} catch(e) {
		throw new CustomerServiceError('Could not query customers', 'UNKNOWN', e);
	}
}

export async function getCustomer(id: string): Promise<Customer> {
	let customer: Customer | undefined;
	try {
		[customer] = await sql<Customer[]>`
			SELECT ${sql(customerColumns)}
			FROM customers
			WHERE id = ${id}
		`;
	} catch(e) {
		throw new CustomerServiceError('Could not query customers', 'UNKNOWN', e);
	}

	if(!customer) throw new CustomerServiceError('Customer not found', 'NOT_FOUND');

	return customer;
}

type UpdateCustomerInput = {
	firstName?: string;
	lastName?: string;
	email?: string;
	meta?: Record<string, unknown>;
	updatedBy?: string;
};

export async function updateCustomer(id: string, updates: UpdateCustomerInput): Promise<Customer> {
	for(const u in updates) {
		// Update whitelist
		if(![
			'firstName',
			'lastName',
			'email',
			'meta',
			'updatedBy'
		].includes(u)) throw new CustomerServiceError('Invalid customer data', 'INVALID');
	}

	if(Object.keys(updates).length === 1 && updates.updatedBy) throw new CustomerServiceError('Invalid customer data', 'INVALID');

	let customer: Customer | undefined;
	try {
		[customer] = await sql<Customer[]>`
			UPDATE customers
			SET ${sql(updates)}, updated = now()
			WHERE id = ${id}
			RETURNING ${sql(customerColumns)}
		`;
	} catch(e) {
		throw new CustomerServiceError('Could not update customer', 'UNKNOWN', e);
	}

	if(!customer) throw new CustomerServiceError('Customer not found', 'NOT_FOUND');

	return customer;
}

