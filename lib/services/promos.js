/**
 * Promos Service
 * Handles all promo actions
 * @type {Object}
 */
const { sql } = require('../utils/db'),
	{ v4: uuidV4 } = require('uuid');

class PromoServiceError extends Error {
	constructor(message = 'An unknown error occured', code = 'UNKNOWN', context) {
		super(message);

		this.name = this.constructor.name;
		this.code = code;
		this.context = context;

		Error.captureStackTrace(this, this.constructor);
	}
}

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
	'recipient_name',
	'status',
	'type',
	'meta'
];

module.exports = {
	async createPromo({ price, type, productId, quantity = 1, recipientName, meta, createdBy }) {
		if(!productId || !type || typeof quantity !== 'number' || quantity < 1) throw new PromoServiceError('Missing promo data', 'INVALID');
		if(type === 'single-use') {
			if(!price || !recipientName) throw new PromoServiceError('Single use promos require price and recipient', 'INVALID');
			if(typeof price !== 'number') throw new PromoServiceError('Price must be a number', 'INVALID');
		}

		const promo = {
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
		}

		try {
			const [createdPromo] = await sql`
				INSERT INTO promos ${sql(promo)}
				RETURNING ${sql(promoColumns)}
			`;

			return createdPromo;
		} catch(e) {
			throw new PromoServiceError('Could not create promo', 'UNKNOWN', e);
		}
	},

	async getPromos({ eventId } = {}) {
		try {
			let promos;
			if(eventId) {
				promos = await sql`
					SELECT ${sql(promoColumns.map(c => `p.${c}`))}
					FROM promos as p
					JOIN products as pr
						ON pr.id = p.product_id
					WHERE pr.event_id = ${eventId}
				`;
			} else {
				promos = await sql`
					SELECT ${sql(promoColumns)}
					FROM promos
				`;
			}

			return promos;
		} catch(e) {
			throw new PromoServiceError('Could not query promos', 'UNKNOWN', e);
		}
	},

	async getPromo(id) {
		let promo;
		try {
			[promo] = await sql`
				SELECT ${sql(promoColumns)}
				FROM promos
				WHERE id = ${id}
			`;
		} catch(e) {
			throw new PromoServiceError('Could not query promos', 'UNKNOWN', e);
		}

		if(!promo) throw new PromoServiceError('Promo not found', 'NOT_FOUND');

		return promo;
	},

	async updatePromo(id, updates) {
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
			[promo] = await sql`
				UPDATE promos
				SET ${sql(updates)}, updated = now()
				WHERE id = ${id}
				RETURNING ${sql(promoColumns)}
			`;
		} catch(e) {
			throw new PromoServiceError('Could not update promo', 'UNKNOWN', e);
		}

		if(!promo) throw new PromoServiceError('Promo not found', 'NOT_FOUND');

		return promo;
	}
};
