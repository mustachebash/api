/**
 * Promos Service
 * Handles all promo actions
 * @type {Object}
 */
import { sql } from '../utils/db.js';
import { v4 as uuidV4 } from 'uuid';

class PromoServiceError extends Error {
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

type PromoType = 'single-use' | 'coupon';
export type Promo = {
	id: string;
	created: Date;
	createdBy: string;
	price?: number;
	percentDiscount?: number;
	flatDiscount?: number;
	productId: string;
	productQuantity?: number;
	recipientName?: string;
	maxUses?: number;
	status: string;
	type: PromoType;
	meta: Record<string, unknown>;
};

const promoColumns = [
	'id',
	'created',
	'updated',
	'created_by',
	'updated_by',
	'price',
	'percent_discount',
	'flat_discount',
	'product_id',
	'product_quantity',
	'recipient_name',
	'status',
	'type',
	'meta'
];

const convertPriceAndDiscountsToNumbers = (p: Promo): Promo => ({
	...p,
	...(typeof p.price === 'string' ? {price: Number(p.price)} : {}),
	...(typeof p.percentDiscount === 'string' ? {percentDiscount: Number(p.percentDiscount)} : {}),
	...(typeof p.flatDiscount === 'string' ? {flatDiscount: Number(p.flatDiscount)} : {})
});

type PromoInput = {
	price?: number;
	flatDiscount?: number;
	percentDiscount?: number;
	type: PromoType;
	productId: string;
	productQuantity?: number;
	maxUses?: number;
	recipientName?: string;
	meta: Record<string, unknown>;
	createdBy: string;
};
type PromoInsert = Omit<Promo, 'created' | 'updated'>;
export async function createPromo({ price, flatDiscount, percentDiscount, maxUses, type, productId, productQuantity = 1, recipientName, meta, createdBy }: PromoInput) {
	if(!productId || !type) throw new PromoServiceError('Missing promo data', 'INVALID');
	if(type === 'single-use') {
		if(typeof productQuantity !== 'number' || productQuantity < 1 || productQuantity > 5) throw new PromoServiceError('Invalid product quantity for single-use promo', 'INVALID');
		if(!price || !recipientName) throw new PromoServiceError('Single use promos require price and recipient', 'INVALID');
		if(typeof price !== 'number') throw new PromoServiceError('Price must be a number', 'INVALID');
	}

	const promo: PromoInsert = {
		id: uuidV4(),
		status: 'active',
		createdBy,
		productId,
		type,
		meta: {
			...meta
		}
	};

	if(type === 'single-use') {
		promo.price = price;
		promo.recipientName = recipientName;
		promo.productQuantity = productQuantity;
	}

	if(type === 'coupon') {
		if(percentDiscount) promo.percentDiscount = percentDiscount;
		if(flatDiscount) promo.flatDiscount = flatDiscount;
		promo.maxUses = maxUses;
	}

	try {
		const [createdPromo] = (await sql<Promo[]>`
			INSERT INTO promos ${sql(promo)}
			RETURNING ${sql(promoColumns)}
		`).map(convertPriceAndDiscountsToNumbers);

		return createdPromo;
	} catch(e) {
		throw new PromoServiceError('Could not create promo', 'UNKNOWN', e);
	}
}

export async function getPromos({ eventId }: {eventId?: string;} = {}) {
	try {
		let promos;
		if(eventId) {
			promos = await sql<Promo[]>`
				SELECT ${sql(promoColumns.map(c => `p.${c}`))}
				FROM promos as p
				JOIN products as pr
					ON pr.id = p.product_id
				WHERE pr.event_id = ${eventId}
			`;
		} else {
			promos = await sql<Promo[]>`
				SELECT ${sql(promoColumns)}
				FROM promos
			`;
		}

		return promos.map(convertPriceAndDiscountsToNumbers);
	} catch(e) {
		throw new PromoServiceError('Could not query promos', 'UNKNOWN', e);
	}
}

export async function getPromo(id: string) {
	let promo;
	try {
		[promo] = (await sql<Promo[]>`
			SELECT ${sql(promoColumns)}
			FROM promos
			WHERE id = ${id}
		`).map(convertPriceAndDiscountsToNumbers);
	} catch(e) {
		throw new PromoServiceError('Could not query promos', 'UNKNOWN', e);
	}

	if(!promo) throw new PromoServiceError('Promo not found', 'NOT_FOUND');

	return promo;
}

export async function updatePromo(id: string, updates: Record<string, unknown>) {
	for(const u in updates) {
		// Update whitelist
		if(![
			'recipientName',
			'price',
			'status',
			'meta',
			'updatedBy'
		].includes(u)) throw new PromoServiceError('Invalid promo data', 'INVALID');
	}

	if(Object.keys(updates).length === 1 && updates.updatedBy) throw new PromoServiceError('Invalid promo data', 'INVALID');

	let promo;
	try {
		[promo] = (await sql<Promo[]>`
			UPDATE promos
			SET ${sql(updates)}, updated = now()
			WHERE id = ${id}
			RETURNING ${sql(promoColumns)}
		`).map(convertPriceAndDiscountsToNumbers);
	} catch(e) {
		throw new PromoServiceError('Could not update promo', 'UNKNOWN', e);
	}

	if(!promo) throw new PromoServiceError('Promo not found', 'NOT_FOUND');

	return promo;
}
