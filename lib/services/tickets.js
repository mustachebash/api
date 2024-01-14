/**
 * Guests Service
 * Handles all guest/ticket actions
 * @type {Object}
 */
const { toDataURL: generateQRDataURI }  = require('qrcode'),
	jwt = require('jsonwebtoken'),
	{ sql } = require('../utils/db');

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

module.exports = {
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
				eventName: guest.eventName,
				eventDate: guest.eventDate
				// qrCode
			});
		}

		return tickets;
	},

	checkInWithTicket() {
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
};
