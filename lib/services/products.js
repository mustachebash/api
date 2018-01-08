/**
 * Products Service
 * Handles all product actions
 * @type {Object}
 */
const { run, r } = require('../utils/db');

class ProductsServiceError extends Error {
	constructor(message = 'An unknown error occured', code = 'UNKNOWN') {
		super(message);

		this.name = this.constructor.name;
		this.code = code;

		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = {
	async createProduct({ price, name, description, type, eventId }) {
		if(!price || !name || !description || !type) throw new ProductsServiceError('Missing product data', 'INVALID');
		if(typeof price !== 'number') throw new ProductsServiceError('Price must be a number', 'INVALID');
		if(type === 'ticket' && !eventId) throw new ProductsServiceError('No event set for ticket', 'INVALID');

		const product = {
			created: r.now(),
			updated: r.now(),
			status: 'inactive',
			price,
			name,
			description,
			type
		};

		if(type === 'ticket') product.eventId = eventId;

		// Accepts the request object, a product object to add, plus a callback to fire
		const { changes } = await run(r.table('products').insert(product, {returnChanges: true}));

		return changes[0].new_val;
	},

	getProducts() {
		return run(r.table('products')).then(cursor => cursor.toArray());
	},

	getProduct(id) {
		return run(r.table('products').get(id));
	},

	async updateProduct(id, updates) {
		updates.updated = r.now();

		const results = await run(r.table('products').get(id).update(updates, {returnChanges: true})),
			updatedProduct = results.changes.length ? results.changes[0].new_val : null;

		return updatedProduct;
	}
};
