/**
 * Guests Service
 * Handles all guest actions
 * @type {Object}
 */
const { run, r } = require('../utils/db');

module.exports = {
	async createGuest({ firstName, lastName, transactionId, createdBy }) {
		const guest = {
			created: r.now(),
			updated: r.now(),
			firstName,
			lastName,
			transactionId,
			createdBy
		};

		// Accepts the request object, a guest object to add, plus a callback to fire
		const { generated_keys: [id] } = await run(r.table('guests').insert(guest));

		return id;
	},

	getGuests() {
		return run(r.table('guests').orderBy(r.asc('last_name'))).then(cursor => cursor.toArray());
	},

	getGuest(id) {
		return run(r.table('guests').get(id));
	},

	async updateGuest(id, updates) {
		const results = await run(r.table('guests').get(id).update(updates, {returnChanges: true})),
			updatedGuest = results.changes.length ? results.changes[0].new_val : null;

		return updatedGuest;
	}
};
