const guestsRouter = require('express').Router(),
	{ requiresPermission } = require('../middleware/auth'),
	{
		createGuest,
		getGuests,
		getGuest,
		createGuestTicket,
		getTicketQrCode,
		getCurrentGuestTicketQrCode,
		getGuestTickets,
		updateGuest,
		archiveGuest
	} = require('../services/guests');

guestsRouter.route('/')
	.get(async (req, res, next) => {
		try {
			const guests = await getGuests(req.query);

			res.json(guests);
		} catch(e) {
			next(e);
		}
	})
	.post(requiresPermission('admin'), async (req, res, next) => {
		try {
			const guest = await createGuest({createdBy: req.user.username, ...req.body});

			res.location(`https://${req.get('host')}${req.baseUrl}/${guest.id}`);
			res.status(201).json(guest);
		} catch(e) {
			if(e.code === 'INVALID') return next(400);

			next(e);
		}
	});

guestsRouter.route('/:id')
	.get(async (req, res, next) => {
		try {
			const guest = await getGuest(req.params.id);

			if(!guest) return next(404);

			res.json(guest);
		} catch(e) {
			next(e);
		}
	})
	.patch(async (req, res, next) => {
		try {
			const guest = await updateGuest(req.params.id, {updatedBy: req.user.username, ...req.body});

			res.json(guest);
		} catch(e) {
			if(e.code === 'INVALID') return next(400);

			next(e);
		}
	})
	.delete(async (req, res, next) => {
		try {
			const guest = await archiveGuest(req.params.id, req.user.username);

			res.json(guest);
		} catch(e) {
			next(e);
		}
	});

guestsRouter.route('/:id/ticket')
	.get(async (req, res, next) => {
		try {
			const qrcode = await getCurrentGuestTicketQrCode(req.params.id);

			if(!qrcode) return next(404);

			res.send(`<img src="${qrcode}" />`);
		} catch(e) {
			next(e);
		}
	});

guestsRouter.route('/:id/tickets')
	.get(async (req, res, next) => {
		try {
			const tickets = await getGuestTickets(req.params.id);

			res.json(tickets);
		} catch(e) {
			next(e);
		}
	})
	.post(requiresPermission('admin'), async (req, res, next) => {
		try {
			const ticket = await createGuestTicket(req.params.id, {createdBy: req.user.username});

			res.location(`https://${req.get('host')}${req.baseUrl}/${req.params.id}/tickets/${ticket.id}`);
			res.status(201).json(ticket);
		} catch(e) {
			if(e.code === 'NOT_FOUND') return next(404);
			if(e.code === 'LOCKED') return next(423);

			next(e);
		}
	});

guestsRouter.route('/:id/tickets/:ticketId')
	.get(async (req, res, next) => {
		try {
			const qrcode = await getTicketQrCode(req.params.id, req.params.ticketId);

			if(!qrcode) return next(404);

			res.send(`<img src="${qrcode}" />`);
		} catch(e) {
			next(e);
		}
	});

module.exports = guestsRouter;
