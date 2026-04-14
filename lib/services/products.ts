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
	'available_from',
	'available_until',
	'created',
	'updated',
	'updated_by',
	'meta'
];

const convertPriceToNumber = (p: ProductRow): Product => ({ ...p, price: Number(p.price) });

export type ProductType = 'ticket' | 'upgrade' | 'bundle-ticket' | 'accomodation';
export type Product = {
	id: string;
	status?: string;
	price: number;
	name: string;
	description: string;
	type: ProductType;
	maxQuantity: number | null;
	availableFrom?: Date | string | null;
	availableUntil?: Date | string | null;
	eventId?: string;
	admissionTier?: string;
	targetProductId?: string;
	promo?: boolean;
	created?: Date;
	updated?: Date;
	updatedBy?: string | null;
	meta: Record<string, unknown>;
};

type ProductRow = Omit<Product, 'price'> & { price: string };

export async function createProduct({ price, name, description, type, maxQuantity, availableFrom, availableUntil, eventId, admissionTier, targetProductId, promo, meta }: Omit<Product, 'id'>) {
	if (!name || !description || !type) throw new ProductsServiceError('Missing product data', 'INVALID');
	if (typeof price !== 'number') throw new ProductsServiceError('Price must be a number', 'INVALID');
	if (type === 'ticket' && (!eventId || !admissionTier)) throw new ProductsServiceError('No event set for ticket', 'INVALID');
	if (type === 'upgrade' && (!targetProductId || !admissionTier)) throw new ProductsServiceError('No product target set for ticket upgrade', 'INVALID');
	if (type === 'bundle-ticket' && (!eventId || !targetProductId || !admissionTier)) throw new ProductsServiceError('No product target set for bundle ticket', 'INVALID');

	const product: Product = {
		id: uuidV4(),
		price,
		name,
		description,
		type,
		maxQuantity: maxQuantity || null,
		availableFrom: availableFrom || null,
		availableUntil: availableUntil || null,
		meta: {
			...meta
		}
	};

	if (type === 'ticket') {
		product.eventId = eventId;
		product.admissionTier = admissionTier;
		product.promo = Boolean(promo);
	}

	if (type === 'bundle-ticket') {
		product.eventId = eventId;
		product.targetProductId = targetProductId;
		product.admissionTier = admissionTier;
		product.promo = Boolean(promo);
	}

	if (type === 'upgrade') {
		product.targetProductId = targetProductId;
		product.admissionTier = admissionTier;
		product.promo = Boolean(promo);
	}

	if (type === 'accomodation') {
		product.eventId = eventId;
		product.admissionTier = admissionTier;
		product.promo = Boolean(promo);
	}

	try {
		const [createdProduct] = (
			await sql<ProductRow[]>`
			INSERT INTO products ${sql(product)}
			RETURNING ${sql(productColumns)}
		`
		).map(convertPriceToNumber);

		return createdProduct;
	} catch (e) {
		throw new ProductsServiceError('Could not create product', 'UNKNOWN', e);
	}
}

export async function getProducts({ eventId, type }: { eventId?: string; type?: string } = {}) {
	try {
		const products = await sql<ProductRow[]>`
			SELECT ${sql(productColumns)}
			FROM products
			WHERE true
			${eventId ? sql`AND event_id = ${eventId}` : sql``}
			${type ? sql`AND type = ${type}` : sql``}
		`;

		return products.map(convertPriceToNumber);
	} catch (e) {
		throw new ProductsServiceError('Could not query products', 'UNKNOWN', e);
	}
}

export async function getProduct(id: string) {
	let product;
	try {
		[product] = (
			await sql<ProductRow[]>`
			SELECT ${sql(productColumns)}
			FROM products
			WHERE id = ${id}
		`
		).map(convertPriceToNumber);
	} catch (e) {
		throw new ProductsServiceError('Could not query products', 'UNKNOWN', e);
	}

	if (!product) throw new ProductsServiceError('Product not found', 'NOT_FOUND');

	return product;
}

export async function updateProduct(id: string, updates: Record<string, unknown>) {
	for (const u in updates) {
		// Update whitelist
		if (!['name', 'price', 'description', 'status', 'maxQuantity', 'availableFrom', 'availableUntil', 'meta', 'updatedBy'].includes(u))
			throw new ProductsServiceError('Invalid product data', 'INVALID');
	}

	if (Object.keys(updates).length === 1 && updates.updatedBy) throw new ProductsServiceError('Invalid product data', 'INVALID');

	let product;
	try {
		[product] = (
			await sql<ProductRow[]>`
			UPDATE products
			SET ${sql(updates)}, updated = now()
			WHERE id = ${id}
			RETURNING ${sql(productColumns)}
		`
		).map(convertPriceToNumber);
	} catch (e) {
		throw new ProductsServiceError('Could not update product', 'UNKNOWN', e);
	}

	if (!product) throw new ProductsServiceError('product not found', 'NOT_FOUND');

	return product;
}

export async function syncScheduledProductAvailability({ updatedBy = null }: { updatedBy?: string | null } = {}) {
	try {
		const activatedProducts = (
			await sql<ProductRow[]>`
				WITH sold_counts AS (
					SELECT
						p.id AS product_id,
						COALESCE(SUM(oi.quantity), 0) AS total_sold
					FROM products AS p
					LEFT JOIN order_items AS oi
						ON oi.product_id = p.id
					LEFT JOIN orders AS o
						ON o.id = oi.order_id
						AND o.status != 'canceled'
					GROUP BY p.id
				)
				UPDATE products AS p
				SET status = 'active', updated = now(), updated_by = ${updatedBy}
				FROM sold_counts AS sc
				WHERE p.id = sc.product_id
					AND p.status = 'inactive'
					AND p.available_from IS NOT NULL
					AND p.available_from > now() - interval '10 minutes'
					AND p.available_from <= now()
					AND (p.max_quantity IS NULL OR sc.total_sold < p.max_quantity)
				RETURNING ${sql(productColumns.map(c => `p.${c}`))}
			`
		).map(convertPriceToNumber);

		const archivedProducts = (
			await sql<ProductRow[]>`
				UPDATE products AS p
				SET status = 'archived', updated = now(), updated_by = ${updatedBy}
				WHERE p.status = 'active'
					AND p.available_until IS NOT NULL
					AND p.available_until > now() - interval '10 minutes'
					AND p.available_until <= now()
				RETURNING ${sql(productColumns.map(c => `p.${c}`))}
			`
		).map(convertPriceToNumber);

		return {
			activatedProducts,
			archivedProducts
		};
	} catch (e) {
		throw new ProductsServiceError('Could not sync scheduled product availability', 'UNKNOWN', e);
	}
}
