import Router from '@koa/router';
import { authorizeUser, requiresPermission } from '../middleware/auth.js';
import { getEvents, getEvent, createEvent, updateEvent, getEventSummary, getOpeningSales, getEventExtendedStats, getEventDailyTickets, getEventCheckins } from '../services/events.js';
import { isServiceError } from '../utils/type-guards.js';
import { validateEventCreate, validateEventUpdate } from '../utils/validation.js';
import { AppContext } from '../index.js';

const eventsRouter = new Router<AppContext['state'], AppContext>({
	prefix: '/events'
});

eventsRouter.use(authorizeUser);

eventsRouter
	.get('/', async ctx => {
		try {
			const events = await getEvents(ctx.query);

			return (ctx.body = events);
		} catch (e) {
			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	})
	.post('/', requiresPermission('admin'), async ctx => {
		const validation = validateEventCreate(ctx.request.body);
		if (!validation.valid) throw ctx.throw(400, validation.error, { expose: false });

		try {
			const event = await createEvent(validation.data);

			return (ctx.body = event);
		} catch (e) {
			if (isServiceError(e) && e.code === 'INVALID') throw ctx.throw(400, e, { expose: false });

			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	});

eventsRouter
	.get('/:id', async ctx => {
		try {
			const event = await getEvent(ctx.params.id);

			return (ctx.body = event);
		} catch (e) {
			if (isServiceError(e) && e.code === 'NOT_FOUND') throw ctx.throw(404);

			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	})
	.patch('/:id', requiresPermission('admin'), async ctx => {
		const validation = validateEventUpdate(ctx.request.body);
		if (!validation.valid) throw ctx.throw(400, validation.error, { expose: false });

		try {
			const event = await updateEvent(ctx.params.id, { ...validation.data, updatedBy: ctx.state.user!.id });

			return (ctx.body = event);
		} catch (e) {
			if (isServiceError(e) && e.code === 'INVALID') throw ctx.throw(400, e, { expose: false });

			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	});

eventsRouter.get('/:id/summary', async ctx => {
	try {
		const eventSummary = await getEventSummary(ctx.params.id);

		if (!eventSummary) throw ctx.throw(404);

		return (ctx.body = eventSummary);
	} catch (e) {
		if (e instanceof Error) throw ctx.throw(e);
		throw e;
	}
});

eventsRouter.get('/:id/extended-stats', async ctx => {
	try {
		const eventExtendedStats = await getEventExtendedStats(ctx.params.id);

		if (!eventExtendedStats) throw ctx.throw(404);

		return (ctx.body = eventExtendedStats);
	} catch (e) {
		if (e instanceof Error) throw ctx.throw(e);
		throw e;
	}
});

eventsRouter.get('/:id/chart', async ctx => {
	const chartType = ctx.query.type;
	try {
		let chartData;
		switch (chartType) {
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

		if (!chartData) throw ctx.throw(404);

		return (ctx.body = chartData);
	} catch (e) {
		if (e instanceof Error) throw ctx.throw(e);
		throw e;
	}
});

export default eventsRouter;
