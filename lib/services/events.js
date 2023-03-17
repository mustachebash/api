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
		const query = r.expr({})
			.merge(() => ({
				eventId: id,
				totalGuests: r.table('guests').getAll(id, {index: 'eventId'}).filter(row => row('status').eq('active')).count(),
				totalCompedGuests: r.table('guests').getAll(id, {index: 'eventId'}).filter(row => row('confirmationId').eq('COMPED')).count(),
				totalVIPGuests: r.table('guests').getAll(id, {index: 'eventId'}).filter({vip: true}).count(),
				guestsToday: r.table('guests')
					.getAll(id, {index: 'eventId'})
					.filter(g => g('created').inTimezone('-08').date().eq(r.now().inTimezone('-08').date()))
					.filter(row => row('confirmationId').ne('COMPED'))
					.count(),
				checkedIn: r.table('guests').getAll(id, {index: 'eventId'}).filter(g => g('checkedIn').ne(false)).count()
			}));

		return run(query).catch(e => {
			// Stop bad event ids from 500ing
			if(e.name === 'ReqlNonExistenceError') return null;

			throw e;
		});
	},

	getEventExtendedStats(id) {
		const query = r.table('products').getAll(id, {index: 'eventId'}).coerceTo('array').do(eventProducts => {
			return r.table('events')
				.get(id)
				.merge(e => ({
					eventId: e('id'),
					eventBudget: e('budget').default(0),
					eventMaxCapacity: e('maxCapacity').default(0),
					alcoholRevenue: e('alcoholRevenue').default(0),
					foodRevenue: e('foodRevenue').default(0),
					salesTiers: r.table('transactions')
						.filter(row => row('status').default('default').ne('refunded').and(row('status').default('default').ne('voided')).and(row('type').default('default').ne('transfer')))
						.filter(row => row('order').contains(i => eventProducts('id').contains(i('productId'))))
						.concatMap(row => row('order').filter(i => eventProducts('id').contains(i('productId'))))
						.group('productId')
						.sum('quantity')
						.ungroup()
						.map(g => ({
							name: r.table('products').get(g('group'))('name'),
							quantity: g('reduction'),
							price: r.table('products').get(g('group'))('price')
						})),
					averageQuantity: r.table('transactions')
						.filter(row => row.hasFields('promoId').not())
						.filter(row => row('status').default('default').ne('refunded').and(row('status').default('default').ne('voided')).and(row('type').default('default').ne('transfer')))
						.filter(row => row('order').contains(i => eventProducts('id').contains(i('productId'))))
						.concatMap(row => row('order').filter(i => eventProducts('id').contains(i('productId'))))
						.avg('quantity').default(0),
					totalRevenue: r.table('transactions')
						.filter(row => row.hasFields('promoId').not())
						.filter(row => row('status').default('default').ne('refunded').and(row('status').default('default').ne('voided')).and(row('type').default('default').ne('transfer')))
						.filter(row => row('order').contains(i => eventProducts('id').contains(i('productId'))))
						.concatMap(row => row('order').filter(i => eventProducts('id').contains(i('productId'))))
						.group('productId')
						.sum('quantity')
						.ungroup()
						.map(g => r.table('products').get(g('group'))('price').mul(g('reduction')))
						.sum(),
					totalPromoRevenue: r.table('transactions')
						.hasFields('promoId')
						.filter(row => row('order').contains(i => eventProducts('id').contains(i('productId'))))
						.eqJoin('promoId', r.table('promos'))
						.zip()
						.sum('price'),
					revenueToday: r.table('transactions')
						.filter(row => row('created').inTimezone('-08').date().eq(r.now().inTimezone('-08').date()).and(row('order').contains(i => eventProducts('id').contains(i('productId')))))
						.concatMap(row => row('order').filter(i => eventProducts('id').contains(i('productId'))))
						.group('productId')
						.sum('quantity')
						.ungroup()
						.map(g => r.table('products').get(g('group'))('price').mul(g('reduction')))
						.sum()
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
					dailySales: r.table('transactions')
						.filter(row => row('order').contains(i => eventProducts('id').contains(i('productId'))))
						.merge(row => ({
							quantity: row('order').filter(i => eventProducts('id').contains(i('productId')))
								.sum('quantity')
						}))
						.group(t => t('created').inTimezone('-08').date())
						.ungroup()
						.map(d => ({
							date: d('group'),
							revenue: d('reduction').sum('amount'),
							tickets: d('reduction').sum('quantity'),
							transactions: d('reduction').count()
						}))
						.orderBy(g => g('date'))
						.coerceTo('array'),
					openingDaySales: r.table('transactions')
						.filter(row => row('created').inTimezone('-08').date().eq(e('openingSales').date()))
						.filter(row => row('order').contains(i => eventProducts('id').contains(i('productId'))))
						.merge(row => ({
							quantity: row('order').filter(i => eventProducts('id').contains(i('productId')))
								.sum('quantity')
						}))
						.group(t => ([
							t('created').inTimezone('-08').hours(),
							t('created').inTimezone('-08').minutes().lt(30).branch(0, 30)
						]))
						.ungroup()
						.map(d => ({
							time: r.time(
								e('openingSales').year(),
								e('openingSales').month(),
								e('openingSales').day(),
								d('group').nth(0),
								d('group').nth(1),
								0,
								'-08'
							),
							tickets: d('reduction').sum('quantity'),
							transactions: d('reduction').count()
						}))
						.orderBy(g => g('time'))
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
				.pluck('eventId', 'dailySales', 'openingDaySales', 'checkIns', 'name', 'date');
		});

		return run(query).catch(e => {
			// Stop bad event ids from 500ing
			if(e.name === 'ReqlNonExistenceError') return null;

			throw e;
		});
	}
};
