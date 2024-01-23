/**
 * Guests Service
 * Handles all guest/ticket actions
 * @type {Object}
 */
const crypto = require('crypto'),
	{ toDataURL: generateQRDataURI }  = require('qrcode'),
	jwt = require('jsonwebtoken'),
	{ v4: uuidV4 } = require('uuid'),
	{ sql } = require('../utils/db');

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

	async getGuests({ limit, eventId, admissionTier, createdReason, orderBy = 'created', sort = 'desc' }) {
		try {
			const guests = await sql`
				SELECT ${sql(guestColumns)}
				FROM guests
				WHERE 1 = 1
				${eventId ? sql`AND event_id = ${eventId}` : sql``}
				${admissionTier ? sql`AND admission_tier = ${admissionTier}` : sql``}
				${createdReason ? sql`AND created_reason = ${createdReason}` : sql``}
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
