import Router from '@koa/router';
import { authorizeUser, requiresPermission } from '../middleware/auth.js';
import { createGuest, getGuests, getGuest, updateGuest, archiveGuest } from '../services/guests.js';
import { isServiceError } from '../utils/type-guards.js';
import { validateGuestCreate, validateGuestUpdate } from '../utils/validation.js';
import { AppContext } from '../index.js';

const guestsRouter = new Router<AppContext['state'], AppContext>({
	prefix: '/guests'
});

guestsRouter.use(authorizeUser);

guestsRouter
	.get('/', async ctx => {
		try {
			const guests = await getGuests(ctx.query);

			return (ctx.body = guests);
		} catch (e) {
			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	})
	.post('/', requiresPermission('write'), async ctx => {
		const validation = validateGuestCreate(ctx.request.body);
		if (!validation.valid) throw ctx.throw(400, validation.error, { expose: false });

		try {
			const guest = await createGuest({ ...validation.data, createdBy: ctx.state.user!.id, createdReason: 'comp' });

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${guest.id}`);
			ctx.status = 201;
			return (ctx.body = guest);
		} catch (e) {
			if (isServiceError(e) && e.code === 'INVALID') throw ctx.throw(400, e, { expose: false });

			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	});

guestsRouter
	.get('/:id', async ctx => {
		try {
			const guest = await getGuest(ctx.params.id);

			if (!guest) throw ctx.throw(404);

			return (ctx.body = guest);
		} catch (e) {
			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	})
	.patch('/:id', async ctx => {
		const validation = validateGuestUpdate(ctx.request.body);
		if (!validation.valid) throw ctx.throw(400, validation.error, { expose: false });

		try {
			const guest = await updateGuest(ctx.params.id, { updatedBy: ctx.state.user!.id, ...validation.data });

			return (ctx.body = guest);
		} catch (e) {
			if (isServiceError(e) && e.code === 'INVALID') throw ctx.throw(400, e, { expose: false });

			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	})
	.delete('/:id', async ctx => {
		try {
			const guest = await archiveGuest(ctx.params.id, ctx.state.user!.id);

			return (ctx.body = guest);
		} catch (e) {
			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	});

export default guestsRouter;
