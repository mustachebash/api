/**
 * Guests Service
 * Handles all guest/ticket actions
 * @type {Object}
 */
const { toDataURL: generateQRDataURI }  = require('qrcode'),
	jwt = require('jsonwebtoken'),
	config = require('../config'),
	{ run, r } = require('../utils/db');

class GuestsServiceError extends Error {
	constructor(message = 'An unknown error occured', code = 'UNKNOWN') {
		super(message);

		this.name = this.constructor.name;
		this.code = code;

		Error.captureStackTrace(this, this.constructor);
	}
}

const generateTicketToken = ({ id, guestId, created }) => jwt.sign({
	iss: 'mustachebash',
	aud: guestId,
	iat: Math.round(created / 1000),
	sub: id
},
config.jwt.ticketSecret);

module.exports = {
	async createGuest({ firstName, lastName, transactionId = 'COMPED', confirmationId = 'COMPED', createdBy = 'purchase', eventId }) {
		if(!firstName || !lastName || !eventId || (transactionId === 'COMPED' && createdBy === 'purchase')) throw new GuestsServiceError('Missing guest data', 'INVALID');

		const guest = {
			created: r.now(),
			updated: r.now(),
			checkedIn: false,
			firstName: firstName.trim(),
			lastName: lastName.trim(),
			status: 'active',
			transactionId,
			confirmationId,
			eventId,
			createdBy
		};

		// Accepts the request object, a guest object to add, plus a callback to fire
		const { changes } = await run(r.table('guests').insert(guest, {returnChanges: true}));

		return changes[0].new_val;
	},

	getGuests({ limit, eventId, orderBy = 'lastName', sort = 'asc' }) {
		let query = r.table('guests');

		if(eventId) {
			if(Array.isArray(eventId)) {
				query = query.getAll(...eventId, {index: 'eventId'});
			} else {
				query = query.getAll(eventId, {index: 'eventId'});
			}
		}

		// Don't let query params 500
		if(!['asc', 'desc'].includes(sort)) sort = 'asc';

		// Order by index for best speed, order by arbitrary for less optimal
		if(['eventId', 'lastName'].includes('orderBy')) {
			query = query.orderBy({index: r[sort](orderBy)});
		} else {
			query = query.orderBy(r[sort](orderBy));
		}

		if(limit && !Number.isNaN(Number(limit))) query = query.limit(Number(limit));

		return run(query).then(cursor => cursor.toArray());
	},

	getGuest(id) {
		return run(r.table('guests').get(id));
	},

	// Restrict this to require both ids
	async getTicketQrCode(guestId, ticketId) {
		const [ ticket ] = await run(r.table('tickets').getAll([guestId, ticketId], {index: 'guestAndTicketId'})).then(cursor => cursor.toArray());

		return generateQRDataURI(generateTicketToken(ticket));
	},

	async createGuestTicket(guestId, { createdBy = 'purchase' } = {}) {
		const guest = await run(r.table('guests').get(guestId));

		if(guest.checkedIn) throw new GuestsServiceError('Could not create ticket - guest already checked in', 'LOCKED');
		if(!guest) throw new GuestsServiceError('Could not create ticket - guest does not exist', 'NOT_FOUND');

		// Disable all other tickets first
		await run(r.table('tickets').getAll(guestId, {index: 'guestId'}).update({status: 'disabled'}));

		// Insert a new ticket
		const { changes } = await run(r.table('tickets').insert({
			created: r.now(),
			status: 'active',
			eventId: guest.eventId,
			createdBy,
			guestId
		}, {returnChanges: true}));

		return changes[0].new_val;
	},

	async getCurrentGuestTicketQrCode(guestId) {
		const [ ticket ] = await run(r.table('tickets').getAll(guestId, {index: 'guestId'}).filter({status: 'active'})).then(cursor => cursor.toArray());

		return generateQRDataURI(generateTicketToken(ticket));
	},

	getGuestTickets(guestId) {
		return run(r.table('tickets').getAll(guestId, {index: 'guestId'})).then(cursor => cursor.toArray());
	},

	async getTransactionTickets(transactionId) {
		const query = r.table('guests')
			.filter({transactionId})
			.eqJoin('id', r.table('tickets'), {index: 'guestId'})
			.filter({right: {status: 'active'}})
			.map({guest: r.row('left'), ticket: r.row('right').merge(row => r.table('events').get(row('eventId')).pluck('name', 'date'))});

		const conn = await r.connect({
				host: config.db.host,
				port: config.db.port,
				db: config.db.name
			}),
			pairs = await query.run(conn).then(cursor => cursor.toArray());

		conn.close();

		// Inject the QR Codes
		for (const pair of pairs) {
			pair.ticket.qrCode = await generateQRDataURI(generateTicketToken(pair.ticket));
		}

		return pairs;
	},

	async updateGuest(id, updates) {
		for(const u in updates) {
			// Update whitelist
			if(!['checkedIn', 'firstName', 'lastName', 'updatedBy', 'notes'].includes(u)) throw new GuestsServiceError('Invalid guest data', 'INVALID');
		}

		if(Object.keys(updates).length === 1 && updates.updatedBy) throw new GuestsServiceError('Invalid guest data', 'INVALID');

		// Force checkins to RethinkDB time
		if(updates.checkedIn) updates.checkedIn = r.now();

		updates.updated = r.now();

		const results = await run(r.table('guests').get(id).update(updates, {returnChanges: true})),
			updatedGuest = results.changes.length ? results.changes[0].new_val : null;

		return updatedGuest;
	},

	async archiveGuest(id, updatedBy) {
		const results = await run(r.table('guests').get(id).update({status: 'archived', updated: r.now(), updatedBy}, {returnChanges: true})),
			archivedGuest = results.changes.length ? results.changes[0].new_val : null;

		return archivedGuest;
	}
};
