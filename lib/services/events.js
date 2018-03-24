/**
 * Events Service
 * Handles all event actions
 * @type {Object}
 */
const { run, r } = require('../utils/db');

class EventsServiceError extends Error {
	constructor(message = 'An unknown error occured', code = 'UNKNOWN') {
		super(message);

		this.name = this.constructor.name;
		this.code = code;

		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = {
	getEvents({ status }) {
		let query = r.table('events').orderBy('date');

		if(status) query = query.filter({status});

		return run(query).then(cursor => cursor.toArray());
	},

	getEvent(id) {
		return run(r.table('events').get(id));
	},

	async updateEvent(id, updates) {
		for(const u in updates) {
			// Update whitelist
			if(!['salesOn', 'currentTicket', 'updatedBy'].includes(u)) throw new EventsServiceError('Invalid event data', 'INVALID');
		}

		if(Object.keys(updates).length === 1 && updates.updatedBy) throw new EventsServiceError('Invalid event data', 'INVALID');

		updates.updated = r.now();

		const results = await run(r.table('events').get(id).update(updates, {returnChanges: true})),
			updatedEvent = results.changes.length ? results.changes[0].new_val : null;

		return updatedEvent;
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
	},

	getEventChart(id) {
		const query = r.table('products').getAll(id, {index: 'eventId'}).coerceTo('array').do(eventProducts => {
			return r.table('events')
				.get(id)
				.merge(e => ({
					eventId: e('id'),
					guests: r.table('guests').getAll(e('id'), {index: 'eventId'})
						.group(g => g('created').inTimezone('-08').date())
						.count()
						.ungroup()
						.map(d => [
							d('group'),
							d('reduction')
						])
						.orderBy(g => g.nth(0))
						.coerceTo('array'),
					transactions: r.table('transactions')
						.filter(row => row('order').contains(i => eventProducts('id').contains(i('productId'))))
						.merge(row => ({
							quantity: row('order').filter(i => eventProducts('id').contains(i('productId')))
								.sum('quantity')
						}))
						.group(t => t('created').inTimezone('-08').date())
						.ungroup()
						.map(d => [
							d('group'),
							{
								amount: d('reduction').sum('amount'),
								quantity: d('reduction').sum('quantity')
							}
						])
						.orderBy(g => g.nth(0))
						.coerceTo('array'),
					checkIns: r.table('guests')
						.getAll(e('id'), {index: 'eventId'})
						.filter(row => row('checkedIn').typeOf().eq('PTYPE<TIME>'))
						.group(row => ([
							row('checkedIn').inTimezone('-07').hours(),
							row('checkedIn').inTimezone('-07').minutes().lt(30).branch(0, 30)
						]))
						.count()
						.ungroup()
						.map(row => ({
							hour: row('group').nth(0),
							minutes: row('group').nth(1),
							checkedIn: row('reduction')
						}))
				}))
				.pluck('eventId', 'guests', 'transactions', 'checkIns', 'name', 'date');
		});

		return run(query).catch(e => {
			// Stop bad event ids from 500ing
			if(e.name === 'ReqlNonExistenceError') return null;

			throw e;
		});
	}
};
