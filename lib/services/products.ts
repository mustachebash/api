/**
 * Products Service
 * Handles all product actions
 * @type {Object}
 */
import { sql } from '../utils/db.js';
import { v4 as uuidV4 } from 'uuid';

class ProductsServiceError extends Error {
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

const productColumns = [
	'id',
	'status',
	'type',
	'name',
	'description',
	'admission_tier',
	'price',
	'event_id',
	'target_product_id',
	'promo',
	'max_quantity',
	'created',
	'updated',
	'updated_by',
	'meta'
];

const convertPriceToNumber = (p: Record<string, unknown>) => ({...p, ...(typeof p.price === 'string' ? {price: Number(p.price)} : {})});

type ProductType = 'ticket' | 'upgrade' | 'bundle-ticket' | 'accomodation';
type AdmissionTier = 'general' | 'vip' | 'sponsor' | 'stachepass';
export type Product = {
	id: string;
	price: number;
	name: string;
	description: string;
	type: ProductType;
	maxQuantity: number | null;
	eventId: string;
	admissionTier: string;
	targetProductId: string;
	promo: boolean;
	meta: Record<string, unknown>;
};

export async function createProduct({ price, name, description, type, maxQuantity, eventId, admissionTier, targetProductId, promo, meta }: Omit<Product, 'id'>) {
	if(!name || !description || !type) throw new ProductsServiceError('Missing product data', 'INVALID');
	if(typeof price !== 'number') throw new ProductsServiceError('Price must be a number', 'INVALID');
	if(type === 'ticket' && (!eventId || !admissionTier)) throw new ProductsServiceError('No event set for ticket', 'INVALID');
	if(type === 'upgrade' && (!targetProductId || !admissionTier)) throw new ProductsServiceError('No product target set for ticket upgrade', 'INVALID');
	if(type === 'bundle-ticket' && (!eventId || !targetProductId || !admissionTier)) throw new ProductsServiceError('No product target set for bundle ticket', 'INVALID');

	const product: Product = {
		id: uuidV4(),
		price,
		name,
		description,
		type,
		maxQuantity: maxQuantity || null,
		meta: {
			...meta
		}
	};

	if(type === 'ticket') {
		product.eventId = eventId;
		product.admissionTier = admissionTier;
		product.promo = Boolean(promo);
	}

	if(type === 'bundle-ticket') {
		product.eventId = eventId;
		product.targetProductId = targetProductId;
		product.admissionTier = admissionTier;
		product.promo = Boolean(promo);
	}

	if(type === 'upgrade') {
		product.targetProductId = targetProductId;
		product.admissionTier = admissionTier;
		product.promo = Boolean(promo);
	}

	if(type === 'accomodation') {
		product.eventId = eventId;
		product.admissionTier = admissionTier;
		product.promo = Boolean(promo);
	}

	try {
		const [createdProduct] = (await sql`
			INSERT INTO products ${sql(product)}
			RETURNING ${sql(productColumns)}
		`).map(convertPriceToNumber);

		return createdProduct;
	} catch(e) {
		throw new ProductsServiceError('Could not create product', 'UNKNOWN', e);
	}
}

export async function getProducts({eventId, type}: {eventId?: string; type?: string} = {}) {
	try {
		const products = await sql`
			SELECT ${sql(productColumns)}
			FROM products
			WHERE true
			${eventId ? sql`AND event_id = ${eventId}` : sql``}
			${type ? sql`AND type = ${type}` : sql``}
		`;

		return products.map(convertPriceToNumber);
	} catch(e) {
		throw new ProductsServiceError('Could not query products', 'UNKNOWN', e);
	}
}

export async function getProduct(id: string) {
	let product;
	try {
		[product] = (await sql`
			SELECT ${sql(productColumns)}
			FROM products
			WHERE id = ${id}
		`).map(convertPriceToNumber);
	} catch(e) {
		throw new ProductsServiceError('Could not query products', 'UNKNOWN', e);
	}

	if (!product) throw new ProductsServiceError('Product not found', 'NOT_FOUND');

	return product;
}

export async function updateProduct(id: string, updates: Record<string, unknown>) {
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
		[product] = (await sql`
			UPDATE products
			SET ${sql(updates)}, updated = now()
			WHERE id = ${id}
			RETURNING ${sql(productColumns)}
		`).map(convertPriceToNumber);
	} catch(e) {
		throw new ProductsServiceError('Could not update product', 'UNKNOWN', e);
	}

	if(!product) throw new ProductsServiceError('product not found', 'NOT_FOUND');

	return product;
}
