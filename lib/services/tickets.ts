/**
 * Guests Service
 * Handles all guest/ticket actions
 * @type {Object}
 */
import { v4 as uuidV4 } from 'uuid';
import { createGuest } from '../services/guests.js';
import log from '../utils/log.js';
import { sql } from '../utils/db.js';

class TicketsServiceError extends Error {
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

// For now, ticket "seed" is fine to be used as plaintext since we can use it as
// a revokable identifier, but are not rolling "live" tickets this year
// ie, we aren't seeding a TOTP with it, and therefore it does not need to be a secret value.
// This keeps the QR payload very short, and much quicker for scanning (both ease of reading and input time)
function generateQRPayload(ticketSeed: string) {
	return ticketSeed;
}

export async function getOrderTickets(orderId: string) {
	let guests;
	try {
		guests = await sql`
			SELECT
				g.id,
				g.admission_tier,
				e.id as event_id,
				e.name as event_name,
				e.date as event_date,
				g.ticket_seed,
				g.status
			FROM guests as g
			LEFT JOIN events as e
				ON e.id = g.event_id
			WHERE g.order_id = ${orderId}
		`;
	} catch(e) {
		throw new TicketsServiceError('Could not query guests for order', 'UNKNOWN', e);
	}

	// Inject the QR Codes
	const tickets = [];
	for (const guest of guests) {
		const qrPayload = generateQRPayload(guest.ticketSeed);

		tickets.push({
			id: guest.id,
			admissionTier: guest.admissionTier,
			eventId: guest.eventId,
			eventName: guest.eventName,
			eventDate: guest.eventDate,
			status: guest.status,
			qrPayload
		});
	}

	return tickets;
}

export async function getCustomerActiveTicketsByOrderId(orderId: string) {
	let rows;
	try {
		rows = await sql`
			SELECT
				o.created AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles' as order_created,
				o.customer_id,
				g.id as guest_id,
				g.status as guest_status,
				g.check_in_time as guest_check_in_time,
				g.admission_tier as guest_admission_tier,
				g.ticket_seed as guest_ticket_seed,
				g.order_id as guest_order_id,
				e.id as event_id,
				e.name as event_name,
				e.date AT TIME ZONE 'UTC' event_date
			FROM orders o
			LEFT JOIN guests as g
				on g.order_id = o.id
			LEFT JOIN events as e
				on g.event_id = e.id
			WHERE o.customer_id = (
					SELECT customer_id
					FROM orders
					WHERE id = ${orderId}
				)
			AND g.status <> 'archived'
			AND e.status = 'active'
		`;

		// Inject the QR Codes
		const tickets = [];
		for (const row of rows) {
			const qrPayload = generateQRPayload(row.guestTicketSeed);

			tickets.push({
				id: row.guestId,
				customerId: row.customerId,
				orderId: row.guestOrderId,
				orderCreated: row.orderCreated,
				admissionTier: row.guestAdmissionTier,
				status: row.guestStatus,
				checkInTime: row.guestCheckInTime,
				eventId: row.eventId,
				eventName: row.eventName,
				eventDate: row.eventDate,
				// qrPayload
			});
		}

		return tickets;
	} catch(e) {
		throw new TicketsServiceError('Could not query orders for customer', 'UNKNOWN', e);
	}
}

/**
 * TICKET TRANSFERS METHODOLOGY
 * A customer makes an order, and later decides to transfer one or more of their tickets to another party:
 * - it's a private sale of all tickets to an untrusted source, so the transfer must be initiated
 *   by the original customer, and accepted by the transferee in some secure way
 *   (this can be us manually doing it on their behalf via written email, or a mechanism on the tickets page)
 * - it's a single shared ticket to a friend who will not arrive as a group, the transfer will only be intiated by the
 *   original customer, and the transferee will still need to accept the transfer via automated email token
 * - once any part of an order has been transferred, its status must be marked as such (but does not indicate all items have been transferred)
 *   This is because from a ledger standpoint, the order needs to denote that not all tickets purchased with the order
 *   are matched to an active guest on the original order.
 * - "guests" are the only thing transferred. "order items" still represent what was purchased in the original order and amount,
 *   so those will not be duplicated and attached to a transfer (the transferee did not "order" "products" from us,
 *   they were granted the result of the product, "guests")
 * - This means that a transfer order cannot "exist" on its own - the ledger starts with the "parent order", and all child orders
 *   are merely records of "guest" transfers
 * - The transferee will be upserted into customers, which means the original customer will need to input first/last/email
 */
export async function transferTickets(
	orderId: string,
	{
		transferee,
		guestIds
	}: {
		transferee: {
			email: string;
			firstName: string;
			lastName: string;
		};
		guestIds: string[];
	}
) {
	if(!transferee) throw new TicketsServiceError('No transferee specified', 'INVALID');
	if(!guestIds?.length) throw new TicketsServiceError('No tickets specified', 'INVALID');

	let order;
	try {
		[order] = (await sql`
			SELECT *
			FROM orders
			WHERE id = ${orderId}
		`);
	} catch(e) {
		throw new TicketsServiceError('Could not query orders', 'UNKNOWN', e);
	}

	if(!order) throw new TicketsServiceError('Order not found', 'NOT_FOUND');
	if(order.status === 'canceled') throw new TicketsServiceError('Cannot transfer this order', 'NOT_PERMITTED');

	let originalGuests;
	try {
		originalGuests = await sql`
			SELECT *
			FROM guests
			WHERE order_id = ${orderId}
			AND id IN ${sql(guestIds)}
		`;
	} catch(e) {
		throw new TicketsServiceError('Could not query guests for order', 'UNKNOWN', e);
	}

	if(!originalGuests.length) throw new TicketsServiceError('Guests not found', 'NOT_FOUND');
	if(originalGuests.some(g => g.status === 'archived')) throw new TicketsServiceError('Cannot transfer archived guests', 'NOT_PERMITTED');

	// Find or insert a customer record for the transferee
	const normalizedEmail = transferee.email.toLowerCase().trim();
	let dbCustomer;
	try {
		[dbCustomer] = await sql`
			SELECT *
			FROM customers
			WHERE email = ${normalizedEmail}
		`;

		if(!dbCustomer) {
			const newCustomer = {
				id: uuidV4(),
				firstName: transferee.firstName.trim(),
				lastName: transferee.lastName.trim(),
				email: normalizedEmail
			};

			[dbCustomer] = await sql`
				INSERT INTO customers ${sql(newCustomer)}
				RETURNING *
			`;
		}
	} catch(e) {
		throw new TicketsServiceError('Could not query or insert customer', 'UNKNOWN', e);
	}

	// Create a new order for 0 dollars, create guests and tickets
	// Package the order object
	const transfereeOrderId = uuidV4(),
		transfereeOrder = {
			id: transfereeOrderId,
			parentOrderId: order.id,
			status: 'complete',
			amount: 0, // 0 dollar amount because no money was collected
			customerId: dbCustomer.id
		};

	// Write the order to the DB
	try {
		await sql`
			INSERT INTO orders ${sql(transfereeOrder)}
		`;
	} catch(e) {
		throw new TicketsServiceError('Could not insert transfer order', 'UNKNOWN', e);
	}

	// Duplicate all original guests but with the transferee's name and id to the DB
	originalGuests.forEach((g, j) => {
		(async () => {
			try {
				await createGuest({
					firstName: dbCustomer.firstName,
					lastName: dbCustomer.lastName  + (j > 0 ? ` Guest ${j}` : ''),
					createdReason: 'transfer',
					eventId: g.eventId,
					orderId: transfereeOrderId,
					admissionTier: g.admissionTier
				});
			} catch(e) {
				log.error(e, 'Error creating guest');
			}
		})();
	});

	// Mark the order as transferred in our system, disable the guests
	try {
		await Promise.all([
			sql`
				UPDATE orders
				SET
					status = 'transferred'
				WHERE id = ${orderId}
			`,
			sql`
				UPDATE guests
				SET
					status = 'archived',
					updated = now()
				WHERE order_id = ${orderId}
				AND id IN ${sql(guestIds)}
			`
		]);
	} catch(e) {
		throw new TicketsServiceError('Order or guest updating failed', 'UNKNOWN', e);
	}

	return {
		transferee: dbCustomer,
		order: transfereeOrder
	};
}

export async function checkInWithTicket(ticketToken: string, scannedBy: string) {
	let guest;
	// For now, this is happening directly with ticket seeds
	try {
		[guest] = await sql`
			SELECT
				g.id,
				g.first_name,
				g.last_name,
				g.status,
				g.order_id,
				g.admission_tier,
				g.check_in_time,
				e.id AS event_id,
				e.name AS event_name,
				e.date AS event_date,
				e.status AS event_status
			FROM guests AS g
			LEFT JOIN events AS e
				ON g.event_id = e.id
			WHERE g.ticket_seed = ${ticketToken}
		`;
	} catch(e) {
		throw new TicketsServiceError('Could not query guests for order', 'UNKNOWN', e);
	}

	if(!guest) throw new TicketsServiceError('Ticket not found for guest', 'TICKET_NOT_FOUND');

	// Guests can't check in more than once
	if(guest.status === 'checked_in') throw new TicketsServiceError('Guest already checked in', 'GUEST_ALREADY_CHECKED_IN', guest);
	// Both entities must be active to check in
	if(guest.status !== 'active') throw new TicketsServiceError('Guest no longer active', 'GUEST_NOT_ACTIVE', guest);
	if(guest.eventStatus !== 'active') throw new TicketsServiceError('Event no longer active', 'EVENT_NOT_ACTIVE', guest);


	// Guests can't check in earlier than 1 hour before the event starts
	if((new Date()).getTime() < (new Date(guest.eventDate)).getTime() - (1000 * 60 * 60 * 24 * 10)) throw new TicketsServiceError('Event has not started yet', 'EVENT_NOT_STARTED', guest);

	// Ticket and check in is valid - mark guest as checked in
	try {
		await sql`
			UPDATE guests
			SET
				status = 'checked_in',
				check_in_time = now(),
				updated_by = ${scannedBy},
				updated = now()
			WHERE id = ${guest.id}
		`;
	} catch(e) {
		throw new TicketsServiceError('Could not update guest', 'UNKNOWN', e);
	}

	return guest;
}
