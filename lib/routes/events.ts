import Router from '@koa/router';
import { authorizeUser, requiresPermission } from '../middleware/auth.js';
import { getEvents, getEvent, createEvent, updateEvent, getEventSummary, getOpeningSales, getEventExtendedStats, getEventDailyTickets } from '../services/events.js';

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
			throw ctx.throw(e);
		}
	})
	.post('/', requiresPermission('admin'), async ctx => {
		try {
			const event = await createEvent(ctx.request.body);

			return ctx.body = event;
		} catch(e) {
			if(e.code === 'INVALID') throw ctx.throw(400);

			throw ctx.throw(e);
		}
	});

eventsRouter
	.get('/:id', async ctx => {
		try {
			const event = await getEvent(ctx.params.id);

			return ctx.body = event;
		} catch(e) {
			if(e.code === 'NOT_FOUND') throw ctx.throw(404);

			throw ctx.throw(e);
		}
	})
	.patch('/:id', requiresPermission('admin'), async ctx => {
		try {
			const event = await updateEvent(ctx.params.id, {...ctx.request.body, updatedBy: ctx.user.id});

			return ctx.body = event;
		} catch(e) {
			if(e.code === 'INVALID') throw ctx.throw(400);

			throw ctx.throw(e);
		}
	});

eventsRouter
	.get('/:id/summary', async ctx => {
		try {
			const eventSummary = await getEventSummary(ctx.params.id);

			if(!eventSummary) throw ctx.throw(404);

			return ctx.body = eventSummary;
		} catch(e) {
			throw ctx.throw(e);
		}
	});

eventsRouter
	.get('/:id/extended-stats', async ctx => {
		try {
			const eventExtendedStats = await getEventExtendedStats(ctx.params.id);

			if(!eventExtendedStats) throw ctx.throw(404);

			return ctx.body = eventExtendedStats;
		} catch(e) {
			throw ctx.throw(e);
		}
	});

eventsRouter
	.get('/:id/chart', async ctx => {
		const chartType = ctx.query.type;
		try {
			let chartData;
			switch(chartType) {
				case 'checkIns':
					// chartData = await getEventCheckins(ctx.params.id);
					break;

				case 'openingSales':
					chartData = await getOpeningSales(ctx.params.id);
					break;

				case 'tickets':
				default:
					chartData = await getEventDailyTickets(ctx.params.id);
					break;
			}

			if(!chartData) throw ctx.throw(404);

			return ctx.body = chartData;
		} catch(e) {
			throw ctx.throw(e);
		}
	});

export default eventsRouter;
