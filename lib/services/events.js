/**
 * Events Service
 * Handles all event actions
 * @type {Object}
 */
const { run, r } = require('../utils/db');

// class EventsServiceError extends Error {
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
	getEvents({ status }) {
		let query = r.table('events').orderBy('date');

		if(status) query = query.filter({status});

		return run(query).then(cursor => cursor.toArray());
	},

	getEvent(id) {
		return run(r.table('events').get(id));
	},

	getEventSummary(id) {
		const query = r.table('products').getAll(id, {index: 'eventId'}).coerceTo('array').do(eventProducts => {
			return r.table('events')
				.get(id)
				.merge(e => ({
					eventId: e('id'),
					totalGuests: r.table('guests').getAll(e('id'), {index: 'eventId'}).count(),
					totalRevenue: r.table('transactions')
						.filter(row => row('order').contains(i => eventProducts('id').contains(i('productId'))))
						.concatMap(row => row('order').filter(i => eventProducts('id').contains(i('productId'))))
						.group('productId')
						.sum('quantity')
						.ungroup()
						.map(g => r.table('products').get(g('group'))('price').mul(g('reduction')))
						.sum(),
					guestsToday: r.table('guests').getAll(e('id'), {index: 'eventId'}).filter(g => g('created').inTimezone('-08').date().eq(r.now().inTimezone('-08').date())).count(),
					revenueToday: r.table('transactions')
						.filter(row => row('created').inTimezone('-08').date().eq(r.now().inTimezone('-08').date()).and(row('order').contains(i => eventProducts('id').contains(i('productId')))))
						.concatMap(row => row('order').filter(i => eventProducts('id').contains(i('productId'))))
						.group('productId')
						.sum('quantity')
						.ungroup()
						.map(g => r.table('products').get(g('group'))('price').mul(g('reduction')))
						.sum(),
					checkedIn: r.table('guests').getAll(e('id'), {index: 'eventId'}).filter(g => g('checkedIn').ne(false)).count()
				}))
				.without('site', 'id');
		});

		return run(query).catch(e => {
			// Stop bad event ids from 500ing
			if(e.name === 'ReqlNonExistenceError') return null;

			throw e;
		});
	}
};
