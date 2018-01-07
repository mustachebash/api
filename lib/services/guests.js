/**
 * Guests Service
 * Handles all guest actions
 * @type {Object}
 */
const { run, r } = require('../utils/db');

class GuestsServiceError extends Error {
	constructor(message = 'An unknown error occured', code = 'UNKNOWN') {
		super(message);

		this.name = this.constructor.name;
		this.code = code;

		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = {
	async createGuest({ firstName, lastName, transactionId = 'COMPED', createdBy = 'purchase' }) {
		if(!firstName || !lastName || (transactionId === 'COMPED' && createdBy === 'purchase')) throw new GuestsServiceError('Missing guest data', 'INVALID');

		const guest = {
			created: r.now(),
			updated: r.now(),
			firstName,
			lastName,
			transactionId,
			createdBy
		};

		// Accepts the request object, a guest object to add, plus a callback to fire
		const { changes } = await run(r.table('guests').insert(guest, {returnChanges: true}));

		return changes[0].new_val;
	},

	getGuests() {
		return run(r.table('guests').orderBy(r.asc('last_name'))).then(cursor => cursor.toArray());
	},

	getGuest(id) {
		return run(r.table('guests').get(id));
	},

	async updateGuest(id, updates) {
		for(const u in updates) {
			if(!['checkedIn', 'firstName', 'lastName', 'updatedBy'].includes(u)) throw new GuestsServiceError('Invalid guest data', 'INVALID');
		}

		if(Object.keys(updates).length === 1 && updates.updatedBy) throw new GuestsServiceError('Invalid guest data', 'INVALID');

		updates.updated = r.now();

		const results = await run(r.table('guests').get(id).update(updates, {returnChanges: true})),
			updatedGuest = results.changes.length ? results.changes[0].new_val : null;

		return updatedGuest;
	}
};
