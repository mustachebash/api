/**
 * Customers Service
 * Handles all customer actions
 * @type {Object}
 */
const { sql } = require('../utils/db'),
	{ v4: uuidV4 } = require('uuid');

class CustomerServiceError extends Error {
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

module.exports = {
	async createCustomer({ firstName, lastName, email, meta }) {
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
	},

	async getCustomers() {
		try {
			const customers = await sql`
				SELECT ${sql(customerColumns)}
				FROM customers
			`;

			return customers;
		} catch(e) {
			throw new CustomerServiceError('Could not query customers', 'UNKNOWN', e);
		}
	},

	async getCustomer(id) {
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
	},

	async updateCustomer(id, updates) {
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
};
