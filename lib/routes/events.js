const eventsRouter = require('express').Router(),
	{ getEvents, getEvent } = require('../services/events');

eventsRouter.route('/')
	.get(async (req, res, next) => {
		try {
			const events = await getEvents(req.query);

			res.json(events);
		} catch(e) {
			next(e);
		}
	});

eventsRouter.route('/:id')
	.get(async (req, res, next) => {
		try {
			const event = await getEvent(req.params.id);

			if(!event) return next(404);

			res.json(event);
		} catch(e) {
			next(e);
		}
	});

module.exports = eventsRouter;
