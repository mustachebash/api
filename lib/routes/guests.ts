import Router from '@koa/router';
import { authorizeUser, requiresPermission } from '../middleware/auth.js';
import {
	createGuest,
	getGuests,
	getGuest,
	updateGuest,
	archiveGuest
} from '../services/guests.js';

const guestsRouter = new Router({
	prefix: '/guests'
});

guestsRouter.use(authorizeUser);

guestsRouter
	.get('/', async ctx => {
		try {
			const guests = await getGuests(ctx.query);

			return ctx.body = guests;
		} catch(e) {
			throw ctx.throw(e);
		}
	})
	.post('/', requiresPermission('write'), async ctx => {
		try {
			const guest = await createGuest({...ctx.request.body, createdBy: ctx.state.user.id, createdReason: 'comp'});

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${guest.id}`);
			ctx.status = 201;
			return ctx.body = guest;
		} catch(e) {
			if(e.code === 'INVALID') throw ctx.throw(400);

			throw ctx.throw(e);
		}
	});

guestsRouter
	.get('/:id', async ctx => {
		try {
			const guest = await getGuest(ctx.params.id);

			if(!guest) throw ctx.throw(404);

			return ctx.body = guest;
		} catch(e) {
			throw ctx.throw(e);
		}
	})
	.patch('/:id', async ctx => {
		try {
			const guest = await updateGuest(ctx.params.id, {updatedBy: ctx.state.user.id, ...ctx.request.body});

			return ctx.body = guest;
		} catch(e) {
			if(e.code === 'INVALID') throw ctx.throw(400, e, {expose: false});

			throw ctx.throw(e);
		}
	})
	.delete('/:id', async ctx => {
		try {
			const guest = await archiveGuest(ctx.params.id, ctx.state.user.id);

			return ctx.body = guest;
		} catch(e) {
			throw ctx.throw(e);
		}
	});

export default guestsRouter;
