/**
 * Sites Service
 * Handles all site actions
 * @type {Object}
 */
const { run, r } = require('../utils/db');

// class SitesServiceError extends Error {
// 	constructor(message = 'An unknown error occured', code = 'UNKNOWN') {
// 		super(message);
//
// 		this.name = this.constructor.name;
// 		this.code = code;
//
// 		Error.captureStackTrace(this, this.constructor);
// 	}
// }

module.exports = {
	getSites() {
		return run(r.table('sites').orderBy('date')).then(cursor => cursor.toArray());
	},

	getSite(id) {
		return run(r.table('sites').get(id));
	},

	getSiteSettings(id) {
		const query = r.table('sites')
			.get(id)
			.without('status', 'template', 'domain')
			.merge({
				events: r.table('events')
					.filter(row => row('site').eq(id).and(row('salesOn')))
					.without('site')
					.coerceTo('array')
			})
			.merge({
				products: r.table('products')
					.getAll(r.args(r.row('events')('id')), {index: 'eventId'})
					.filter(row => row.hasFields('promo').not())
					.pluck('description', 'id', 'name', 'price', 'status', 'eventId')
					.coerceTo('array')
			});

		return run(query).catch(e => {
			// Stop bad site domains from 500ing
			if(e.name === 'ReqlNonExistenceError') return null;

			throw e;
		});
	},

	async updateSiteSettings(id, settingsUpdates) {
		const updates = {
			updated: r.now(),
			settings: settingsUpdates
		};

		const results = await run(r.table('sites').get(id).update(updates, {returnChanges: true})),
			updatedSite = results.changes.length ? results.changes[0].new_val : null;

		return updatedSite;
	},

	getPrivilegedSiteSettings(id) {
		const query = r.table('sites')
			.get(id)
			.without('status', 'template', 'domain')
			.merge({
				events: r.table('events')
					.filter(row => row('site').eq(id).and(row('status').eq('active')))
					.without('site')
					.coerceTo('array')
			})
			.merge({
				products: r.table('products')
					.getAll(r.args(r.row('events')('id')), {index: 'eventId'})
					.filter(row => row.hasFields('promo').not())
					.pluck('description', 'id', 'name', 'price', 'status', 'eventId')
					.coerceTo('array')
			});

		return run(query).catch(e => {
			// Stop bad site domains from 500ing
			if(e.name === 'ReqlNonExistenceError') return null;

			throw e;
		});
	}
};
