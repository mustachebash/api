import Router from '@koa/router';
import { authorizeUser, requiresPermission } from '../middleware/auth.js';
import { getEvents, getEvent, createEvent, updateEvent, getEventSummary, getOpeningSales, getEventCheckins, getEventExtendedStats, getEventDailyTickets } from '../services/events.js';

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
	})
	.post('/', requiresPermission('admin'), async ctx => {
		try {
			const event = await createEvent(ctx.request.body);

			return ctx.body = event;
		} catch(e) {
			if(e.code === 'INVALID') ctx.throw(400);

			ctx.throw(e);
		}
	});

eventsRouter
	.get('/:id', async ctx => {
		try {
			const event = await getEvent(ctx.params.id);

			return ctx.body = event;
		} catch(e) {
			if(e.code === 'NOT_FOUND') ctx.throw(404);

			ctx.throw(e);
		}
	})
	.patch('/:id', requiresPermission('admin'), async ctx => {
		try {
			const event = await updateEvent(ctx.params.id, {...ctx.request.body, updatedBy: ctx.user.id});

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
		const chartType = ctx.query.type;
		try {
			let chartData;
			switch(chartType) {
				case 'checkIns':
					chartData = await getEventCheckins(ctx.params.id);
					break;

				case 'openingSales':
					chartData = await getOpeningSales(ctx.params.id);
					break;

				case 'tickets':
				default:
					chartData = await getEventDailyTickets(ctx.params.id);
					break;
			}

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

export default eventsRouter;
