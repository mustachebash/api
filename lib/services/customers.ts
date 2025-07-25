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

	constructor(message = 'An unknown error occured', code = 'UNKNOWN', context) {
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


export async function createCustomer({ firstName, lastName, email, meta }) {
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
		const [createdCustomer] = (await sql`
			INSERT INTO customers ${sql(customer)}
			RETURNING ${sql(customerColumns)}
		`);

		return createdCustomer;
	} catch(e) {
		throw new CustomerServiceError('Could not create customer', 'UNKNOWN', e);
	}
}

export async function getCustomers() {
	try {
		const customers = await sql`
			SELECT ${sql(customerColumns)}
			FROM customers
		`;

		return customers;
	} catch(e) {
		throw new CustomerServiceError('Could not query customers', 'UNKNOWN', e);
	}
}

export async function getCustomer(id) {
	let customer;
	try {
		[customer] = (await sql`
			SELECT ${sql(customerColumns)}
			FROM customers
			WHERE id = ${id}
		`);
	} catch(e) {
		throw new CustomerServiceError('Could not query customers', 'UNKNOWN', e);
	}

	if(!customer) throw new CustomerServiceError('Customer not found', 'NOT_FOUND');

	return customer;
}

export async function updateCustomer(id, updates) {
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

	let customer;
	try {
		[customer] = (await sql`
			UPDATE customers
			SET ${sql(updates)}, updated = now()
			WHERE id = ${id}
			RETURNING ${sql(customerColumns)}
		`);
	} catch(e) {
		throw new CustomerServiceError('Could not update customer', 'UNKNOWN', e);
	}

	if(!customer) throw new CustomerServiceError('Customer not found', 'NOT_FOUND');

	return customer;
}

