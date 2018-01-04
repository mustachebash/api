const guestsRouter = require('express').Router(),
	{ createGuest, getGuests, getGuest, updateGuest } = require('../services/guests');

guestsRouter.route('/')
	.get(async (req, res, next) => {
		try {
			const guests = await getGuests();

			res.json(guests);
		} catch(e) {
			next(e);
		}
	})
	.post(async (req, res, next) => {
		if(!req.body) return next(400);

		try {
			const guestId = await createGuest({createdBy: req.user.username, ...req.body});

			res.status(201).json(guestId);
		} catch(e) {
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
	.patch((req, res, next) => {
		if(!req.body) return next(400);

		try {
			const guest = updateGuest(req.params.id, {updatedBy: req.user.username, ...req.body});

			res.json(guest);
		} catch(e) {
			next(e);
		}
	});

module.exports = guestsRouter;
