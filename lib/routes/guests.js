const guestsRouter = require('express').Router(),
	{ requiresPermission } = require('../middleware/auth'),
	{ createGuest, getGuests, getGuest, updateGuest } = require('../services/guests');

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
	});

module.exports = guestsRouter;
