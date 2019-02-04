/**
 * Promos Service
 * Handles all promo actions
 * @type {Object}
 */
const { run, r } = require('../utils/db');

class PromoServiceError extends Error {
	constructor(message = 'An unknown error occured', code = 'UNKNOWN') {
		super(message);

		this.name = this.constructor.name;
		this.code = code;

		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = {
	async createPromo({ price, type, productId, recipient, createdBy }) {
		if(!productId || !type) throw new PromoServiceError('Missing promo data', 'INVALID');
		if(type === 'single-use') {
			if(!price || !recipient) throw new PromoServiceError('Single use promos require price and recipient', 'INVALID');
			if(typeof price !== 'number') throw new PromoServiceError('Price must be a number', 'INVALID');
		}

		const promo = {
			created: r.now(),
			updated: r.now(),
			status: 'active',
			createdBy,
			type
		};

		if(type === 'single-use') {
			promo.price = price;
			promo.recipient = recipient;
		}

		// Accepts the request object, a product object to add, plus a callback to fire
		const { changes } = await run(r.table('promos').insert(promo, {returnChanges: true}));

		return changes[0].new_val;
	},

	getPromos() {
		return run(r.table('promos')).then(cursor => cursor.toArray());
	},

	getPromo(id) {
		return run(r.table('promos').get(id));
	},

	async updatePromo(id, updates) {
		updates.updated = r.now();

		const results = await run(r.table('promos').get(id).update(updates, {returnChanges: true})),
			updatedPromo = results.changes.length ? results.changes[0].new_val : null;

		return updatedPromo;
	}
};
