/**
 * Guests Service
 * Handles all guest/ticket actions
 * @type {Object}
 */
import crypto from 'crypto';
import { toDataURL as generateQRDataURI }  from 'qrcode';
import jwt from 'jsonwebtoken';
import { v4 as uuidV4 } from 'uuid';
import { sql } from '../utils/db.js';

class GuestsServiceError extends Error {
	code: string;
	context?: unknown;

	constructor(message = 'An unknown error occured', code = 'UNKNOWN', context?: unknown) {
		super(message);

		this.name = this.constructor.name;
		this.code = code;
		this.context = context;

		Error.captureStackTrace(this, this.constructor);
	}
}

const guestColumns = [
	'id',
	'first_name',
	'last_name',
	'admission_tier',
	'created',
	'updated',
	'updated_by',
	'created_by',
	'created_reason',
	'status',
	'check_in_time',
	'order_id',
	'event_id',
	'meta'
];

export async function createGuest({ firstName, lastName, createdReason, orderId = null, createdBy = null, eventId, admissionTier, meta }) {
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
}

export async function getGuests({ limit, eventId, admissionTier, createdReason, orderBy = 'created', sort = 'desc' }) {
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
}

export async function getGuest(id) {
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
}

export async function updateGuest(id, updates) {
	for(const u in updates) {
		// Update whitelist
		if(!['status', 'firstName', 'lastName', 'updatedBy', 'meta', 'admissionTier'].includes(u)) throw new GuestsServiceError('Invalid guest data', 'INVALID');
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

	// Prevent accidental downgrading of a guest below their purchased tier
	let minimumAdmissionTier;
	if (updates.admissionTier) {
		try {
			[minimumAdmissionTier] = await sql`
				SELECT p.admission_tier
				FROM guests AS g
				LEFT JOIN order_items AS oi
					ON g.order_id = oi.order_id
				LEFT JOIN products AS p
					ON oi.product_id = p.id
					AND g.event_id = p.event_id
				WHERE g.id = ${id}
				AND p.id IS NOT NULL
			`;
		} catch(e) {
			throw new GuestsServiceError('Could not query guest', 'UNKNOWN', e);
		}

		if(!minimumAdmissionTier) throw new GuestsServiceError('Guest not found', 'NOT_FOUND');

		// TODO: make this a tiered access list similar to user roles so we can support multiple levels in the future
		if(
			minimumAdmissionTier.admissionTier === 'vip' &&
			updates.admissionTier === 'general'
		) {
			throw new GuestsServiceError('Cannot downgrade VIP guest to general admission', 'INVALID');
		}
	}

	let updatedGuest;
	try {
		[updatedGuest] = await sql`
			UPDATE guests
			SET ${sql(updates)}, updated = now()
			WHERE id = ${id}
			RETURNING ${sql(guestColumns)}
		`;
	} catch(e) {
		throw new GuestsServiceError('Could not update guest', 'UNKNOWN', e);
	}

	if(!updatedGuest) throw new GuestsServiceError('guest not found', 'NOT_FOUND');

	return updatedGuest;
}

export async function archiveGuest(id, updatedBy) {
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
