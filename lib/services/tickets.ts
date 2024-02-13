/**
 * Guests Service
 * Handles all guest/ticket actions
 * @type {Object}
 */
import { toDataURL as generateQRDataURI } from 'qrcode';
import jwt from 'jsonwebtoken';
import { v4 as uuidV4 } from 'uuid';
import { createGuest } from '../services/guests.js';
import log from '../utils/log.js';
import { sql } from '../utils/db.js';

class TicketsServiceError extends Error {
	constructor(message = 'An unknown error occured', code = 'UNKNOWN', context) {
		super(message);

		this.name = this.constructor.name;
		this.code = code;
		this.context = context;

		Error.captureStackTrace(this, this.constructor);
	}
}

// eslint-disable-next-line no-unused-vars
const generateTicketToken = ({ id, created, ticketSeed }) => jwt.sign({
	aud: ticketSeed,
	iat: Math.round(created / 1000),
	sub: id
},
ticketSeed);

export async function getOrderTickets(orderId) {
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
		// const qrCode = await generateQRDataURI(generateTicketToken(guest).split('.').pop());
		// eslint-disable-next-line no-unused-vars
		const qrCode = await generateQRDataURI(`${guest.id}:${Date.now()}`);

		tickets.push({
			id: guest.id,
			admissionTier: guest.admissionTier,
			eventId: guest.eventId,
			eventName: guest.eventName,
			eventDate: guest.eventDate,
			status: guest.status
			// qrCode
		});
	}

	return tickets;
}

export async function getCustomerActiveTicketsByOrderId(orderId) {
	let rows;
	try {
		rows = await sql`
			SELECT
				o.created AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles' as order_created,
				o.customer_id,
				g.id as guest_id,
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
			// const qrCode = await generateQRDataURI(generateTicketToken(guest).split('.').pop());
			// eslint-disable-next-line no-unused-vars
			const qrCode = await generateQRDataURI(`${row.guestId}:${Date.now()}`);

			tickets.push({
				id: row.guestId,
				customerId: row.customerId,
				orderId: row.guestOrderId,
				orderCreated: row.orderCreated,
				admissionTier: row.guestAdmissionTier,
				eventId: row.eventId,
				eventName: row.eventName,
				eventDate: row.eventDate
				// qrCode
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
export async function transferTickets(orderId, { transferee, guestIds }) {
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

export function checkInWithTicket() {
	throw new TicketsServiceError('Not yet implemented', 'NOT_IMPLEMENTED');
	// let ticketId, ticketGuestId;
	// try {
	// 	({ sub: ticketId, aud: ticketGuestId } = jwt.verify(ticketToken, config.jwt.ticketSecret, {issuer: 'mustachebash'}));
	// } catch(e) {
	// 	throw new TicketsServiceError('Invalid ticket token', 'INVALID_TICKET_TOKEN');
	// }

	// const [ { ticket, guest, event } = {} ] = await run(r.table('tickets')
	// 	.getAll([ticketGuestId, ticketId ], {index: 'guestAndTicketId'})
	// 	.eqJoin('eventId', r.table('events'))
	// 	.map({
	// 		ticket: r.row('left'),
	// 		event: r.row('right'),
	// 		guest: r.table('guests').get(r.row('left')('guestId'))
	// 	}))
	// 	.then(cursor => cursor.toArray());

	// if(!ticket) throw new TicketsServiceError('Ticket not found for guest', 'TICKET_NOT_FOUND');

	// // All three entities must be active to check in
	// if(ticket.status !== 'active' && ticket.status !== 'consumed') throw new TicketsServiceError('Ticket no longer active', 'TICKET_NOT_ACTIVE', {ticket, guest, event});
	// if(guest.status !== 'active') throw new TicketsServiceError('Guest no longer active', 'GUEST_NOT_ACTIVE', {ticket, guest, event});
	// if(event.status !== 'active') throw new TicketsServiceError('Event no longer active', 'EVENT_NOT_ACTIVE', {ticket, guest, event});

	// // Guests can't check in more than once
	// if(guest.checkedIn) throw new TicketsServiceError('Guest already checked in', 'GUEST_ALREADY_CHECKED_IN', {ticket, guest, event});

	// // Guests can't check in before the event starts
	// if(event.enforceCheckInTime && new Date() < new Date(event.date)) throw new TicketsServiceError('Event has not started yet', 'EVENT_NOT_STARTED', {ticket, guest, event});

	// // Ticket and check in is valid - mark guest as checked in and ticket as used (sequentially)
	// await run(r.table('guests').get(guest.id).update({checkedIn: r.now(), updated: r.now(), updatedBy: username}));
	// await run(r.table('tickets').get(ticket.id).update({status: 'consumed'}));

	// return {event, guest, ticket};
}
