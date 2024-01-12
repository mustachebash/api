/**
 * Guests Service
 * Handles all guest/ticket actions
 * @type {Object}
 */
const crypto = require('crypto'),
	{ toDataURL: generateQRDataURI }  = require('qrcode'),
	jwt = require('jsonwebtoken'),
	{ v4: uuidV4 } = require('uuid'),
	config = require('../config'),
	{ run, r, sql } = require('../utils/db');

class GuestsServiceError extends Error {
	constructor(message = 'An unknown error occured', code = 'UNKNOWN', context) {
		super(message);

		this.name = this.constructor.name;
		this.code = code;
		this.context = context;

		Error.captureStackTrace(this, this.constructor);
	}
}

const generateTicketToken = ({ id, created, ticketSeed }) => jwt.sign({
	iss: 'mustachebash',
	aud: 'ticket',
	iat: Math.round(created / 1000),
	sub: id
},
ticketSeed);

const guestColumns = [
	'id',
	'first_name',
	'last_name',
	'admission_tier',
	'created',
	'updated',
	'created_by',
	'created_reason',
	'status',
	'check_in_time',
	'order_id',
	'event_id',
	'meta'
];

module.exports = {
	async createGuest({ firstName, lastName, createdReason, orderId = null, createdBy = null, eventId, admissionTier, meta }) {
		if(!firstName || !lastName || !eventId || !admissionTier || !createdReason || (orderId === null && createdReason === 'purchase')) throw new GuestsServiceError('Missing guest data', 'INVALID');

		const guest = {
			id: uuidV4(),
			firstName: firstName.trim(),
			lastName: lastName.trim(),
			admissionTier,
			orderId,
			eventId,
			createdBy,
			createdReason,
			ticketSeed: crypto.randomBytes(12).toString('hex'),
			meta: {
				...meta
			}
		};

		try {
			const [createdGuest] = await sql`
				INSERT INTO guests ${sql(guest)}
				RETURNING ${sql(guestColumns)}
			`;

			return createdGuest;
		} catch(e) {
			throw new GuestsServiceError('Could not create product', 'UNKNOWN', e);
		}
	},

	async getGuests({ limit, eventId, orderBy = 'created', sort = 'desc' }) {
		try {
			const guests = await sql`
				SELECT ${sql(guestColumns)}
				FROM guests
				${eventId ? sql`WHERE event_id = ${eventId}` : sql``}
				ORDER BY ${sql(orderBy)} ${sort === 'desc' ? sql`desc` : sql`asc`}
				${(limit && Number(limit)) ? sql`LIMIT ${limit}` : sql``}
			`;

			return guests;
		} catch(e) {
			throw new GuestsServiceError('Could not query guests', 'UNKNOWN', e);
		}
	},

	async getGuest(id) {
		let guest;
		try {
			[guest] = await sql`
				SELECT ${sql(guestColumns)}
				FROM guests
				WHERE id = ${id}
			`;
		} catch(e) {
			throw new GuestsServiceError('Could not query guest', 'UNKNOWN', e);
		}

		if(!guest) throw new GuestsServiceError('Guest not found', 'NOT_FOUND');

		return guest;
	},

	async getCurrentGuestTicketQrCode(guestId) {
		let ticket;
		try {
			[ ticket ] = await sql`
				SELECT *
				FROM tickets
				WHERE guest_id = ${guestId}
					AND status = 'active'
			`;
		} catch(e) {
			throw new GuestsServiceError('Could not query guest ticket', 'UNKNOWN', e);
		}

		return generateQRDataURI(generateTicketToken(ticket));
	},

	async getOrderTickets(orderId) {
		let guests;
		try {
			guests = await sql`
				SELECT
					g.id,
					g.admission_tier,
					e.name as event_name,
					e.date as event_date,
					g.ticket_seed
				FROM guests as g
				LEFT JOIN events as e
					ON e.id = g.event_id
				WHERE g.order_id = ${orderId}
			`;
		} catch(e) {
			throw new GuestsServiceError('Could not query guests for order', 'UNKNOWN', e);
		}

		// Inject the QR Codes
		const tickets = [];
		for (const guest of guests) {
			const qrCode = await generateQRDataURI(generateTicketToken(guest));

			tickets.push({
				id: guest.id,
				admissionTier: guest.admissionTier,
				eventName: guest.eventName,
				eventDate: guest.eventDate,
				qrCode
			});
		}

		return tickets;
	},

	async updateGuest(id, updates) {
		for(const u in updates) {
			// Update whitelist
			if(!['status', 'firstName', 'lastName', 'updatedBy', 'meta'].includes(u)) throw new GuestsServiceError('Invalid guest data', 'INVALID');
		}

		if(Object.keys(updates).length === 1 && updates.updatedBy) throw new GuestsServiceError('Invalid guest data', 'INVALID');
		if(updates.status === 'archived') throw new GuestsServiceError('Cannot directly update guest status to `archived`', 'INVALID');

		// Checkin logic
		if(updates.status) {
			if(updates.status === 'checked_in') {
				updates.checkInTime = sql`now()`;
			} else {
				updates.checkInTime = null;
			}
		}

		if(Object.keys(updates).length === 1 && updates.updatedBy) throw new GuestsServiceError('Invalid product data', 'INVALID');

		let guest;
		try {
			[guest] = await sql`
				UPDATE guests
				SET ${sql(updates)}, updated = now()
				WHERE id = ${id}
				RETURNING ${sql(guestColumns)}
			`;
		} catch(e) {
			throw new GuestsServiceError('Could not update guest', 'UNKNOWN', e);
		}

		if(!guest) throw new GuestsServiceError('guest not found', 'NOT_FOUND');

		return guest;
	},

	async checkInWithTicket(ticketToken, username) {
		let ticketId, ticketGuestId;
		try {
			({ sub: ticketId, aud: ticketGuestId } = jwt.verify(ticketToken, config.jwt.ticketSecret, {issuer: 'mustachebash'}));
		} catch(e) {
			throw new GuestsServiceError('Invalid ticket token', 'INVALID_TICKET_TOKEN');
		}

		const [ { ticket, guest, event } = {} ] = await run(r.table('tickets')
			.getAll([ticketGuestId, ticketId ], {index: 'guestAndTicketId'})
			.eqJoin('eventId', r.table('events'))
			.map({
				ticket: r.row('left'),
				event: r.row('right'),
				guest: r.table('guests').get(r.row('left')('guestId'))
			}))
			.then(cursor => cursor.toArray());

		if(!ticket) throw new GuestsServiceError('Ticket not found for guest', 'TICKET_NOT_FOUND');

		// All three entities must be active to check in
		if(ticket.status !== 'active' && ticket.status !== 'consumed') throw new GuestsServiceError('Ticket no longer active', 'TICKET_NOT_ACTIVE', {ticket, guest, event});
		if(guest.status !== 'active') throw new GuestsServiceError('Guest no longer active', 'GUEST_NOT_ACTIVE', {ticket, guest, event});
		if(event.status !== 'active') throw new GuestsServiceError('Event no longer active', 'EVENT_NOT_ACTIVE', {ticket, guest, event});

		// Guests can't check in more than once
		if(guest.checkedIn) throw new GuestsServiceError('Guest already checked in', 'GUEST_ALREADY_CHECKED_IN', {ticket, guest, event});

		// Guests can't check in before the event starts
		if(event.enforceCheckInTime && new Date() < new Date(event.date)) throw new GuestsServiceError('Event has not started yet', 'EVENT_NOT_STARTED', {ticket, guest, event});

		// Ticket and check in is valid - mark guest as checked in and ticket as used (sequentially)
		await run(r.table('guests').get(guest.id).update({checkedIn: r.now(), updated: r.now(), updatedBy: username}));
		await run(r.table('tickets').get(ticket.id).update({status: 'consumed'}));

		return {event, guest, ticket};
	},

	async archiveGuest(id, updatedBy) {
		let guest;
		try {
			[guest] = await sql`
				UPDATE guests
				SET status = 'archived', updated = now(), updated_by = ${updatedBy}
				WHERE id = ${id}
				RETURNING ${sql(guestColumns)}
			`;
		} catch(e) {
			throw new GuestsServiceError('Could not archive guest', 'UNKNOWN', e);
		}

		if(!guest) throw new GuestsServiceError('Guest not found', 'NOT_FOUND');

		return guest;
	}
};
