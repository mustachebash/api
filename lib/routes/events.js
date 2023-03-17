const Router = require('@koa/router'),
	{ authorizeUser, requiresPermission } = require('../middleware/auth'),
	{ getEvents, getEvent, updateEvent, getEventSummary, getEventChart, getEventCheckins, getEventExtendedStats } = require('../services/events');

const eventsRouter = new Router({
	prefix: '/events'
});

eventsRouter.use(authorizeUser);

eventsRouter
	.get('/', async ctx => {
		try {
			const events = await getEvents(ctx.query);

			return ctx.body = events;
		} catch(e) {
			ctx.throw(e);
		}
	});

eventsRouter
	.get('/:id', async ctx => {
		try {
			const event = await getEvent(ctx.params.id);

			if(!event) ctx.throw(404);

			return ctx.body = event;
		} catch(e) {
			ctx.throw(e);
		}
	})
	.patch('/:id', requiresPermission('admin'), async ctx => {
		try {
			const event = await updateEvent(ctx.params.id, {updatedBy: ctx.user.username, ...ctx.request.body});

			return ctx.body = event;
		} catch(e) {
			if(e.code === 'INVALID') ctx.throw(400);

			ctx.throw(e);
		}
	});

eventsRouter
	.get('/:id/summary', async ctx => {
		try {
			const eventSummary = await getEventSummary(ctx.params.id);

			if(!eventSummary) ctx.throw(404);

			return ctx.body = eventSummary;
		} catch(e) {
			ctx.throw(e);
		}
	});

eventsRouter
	.get('/:id/extended-stats', async ctx => {
		try {
			const eventExtendedStats = await getEventExtendedStats(ctx.params.id);

			if(!eventExtendedStats) ctx.throw(404);

			return ctx.body = eventExtendedStats;
		} catch(e) {
			ctx.throw(e);
		}
	});

eventsRouter
	.get('/:id/chart', async ctx => {
		try {
			const chartData = await getEventChart(ctx.params.id);

			if(!chartData) ctx.throw(404);

			return ctx.body = chartData;
		} catch(e) {
			ctx.throw(e);
		}
	});

eventsRouter
	.get('/:id/checkins', async ctx => {
		try {
			const chartData = await getEventCheckins(ctx.params.id);

			if(!chartData) ctx.throw(404);

			return ctx.body = chartData;
		} catch(e) {
			ctx.throw(e);
		}
	});

module.exports = eventsRouter;
