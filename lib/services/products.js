/**
 * Products Service
 * Handles all product actions
 * @type {Object}
 */
const { sql } = require('../utils/db'),
	{ v4: uuidV4 } = require('uuid');

class ProductsServiceError extends Error {
	constructor(message = 'An unknown error occured', code = 'UNKNOWN', context) {
		super(message);

		this.name = this.constructor.name;
		this.code = code;
		this.context = context;

		Error.captureStackTrace(this, this.constructor);
	}
}

const productColumns = [
	'id',
	'status',
	'type',
	'name',
	'description',
	'admission_tier',
	'price',
	'event_id',
	'promo',
	'max_quantity',
	'created',
	'updated',
	'updated_by',
	'meta'
];

module.exports = {
	async createProduct({ price, name, description, type, eventId, admissionTier, promo, meta }) {
		if(!name || !description || !type) throw new ProductsServiceError('Missing product data', 'INVALID');
		if(typeof price !== 'number') throw new ProductsServiceError('Price must be a number', 'INVALID');
		if(type === 'ticket' && (!eventId || !admissionTier)) throw new ProductsServiceError('No event set for ticket', 'INVALID');

		const product = {
			id: uuidV4(),
			price,
			name,
			description,
			type,
			meta: {
				...meta
			}
		};

		if(type === 'ticket') {
			product.eventId = eventId;
			product.admissionTier = admissionTier;
			product.promo = Boolean(promo);
		}

		try {
			const [createdProduct] = await sql`
				INSERT INTO products ${sql(product)}
				RETURNING ${sql(productColumns)}
			`;

			return createdProduct;
		} catch(e) {
			throw new ProductsServiceError('Could not create product', 'UNKNOWN', e);
		}
	},

	async getProducts() {
		try {
			const products = await sql`
				SELECT ${sql(productColumns)}
				FROM products
			`;

			return products;
		} catch(e) {
			throw new ProductsServiceError('Could not query products', 'UNKNOWN', e);
		}
	},

	async getProduct(id) {
		let product;
		try {
			[product] = await sql`
				SELECT ${sql(productColumns)}
				FROM products
				WHERE id = ${id}
			`;
		} catch(e) {
			throw new ProductsServiceError('Could not query products', 'UNKNOWN', e);
		}

		if (!product) throw new ProductsServiceError('Product not found', 'NOT_FOUND');

		return product;
	},

	async updateProduct(id, updates) {
		for(const u in updates) {
			// Update whitelist
			if(![
				'name',
				'price',
				'description',
				'status',
				'maxQuantity',
				'meta',
				'updatedBy'
			].includes(u)) throw new ProductsServiceError('Invalid product data', 'INVALID');
		}

		if(Object.keys(updates).length === 1 && updates.updatedBy) throw new ProductsServiceError('Invalid product data', 'INVALID');

		let product;
		try {
			[product] = await sql`
				UPDATE products
				SET ${sql(updates)}, updated = now()
				WHERE id = ${id}
				RETURNING ${sql(productColumns)}
			`;
		} catch(e) {
			throw new ProductsServiceError('Could not update product', 'UNKNOWN', e);
		}

		if(!product) throw new ProductsServiceError('product not found', 'NOT_FOUND');

		return product;
	}
};
