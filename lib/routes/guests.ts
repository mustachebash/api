import Router from '@koa/router';
import { authorizeUser, requiresPermission } from '../middleware/auth.js';
import {
	createGuest,
	getGuests,
	getGuest,
	getCurrentGuestTicketQrCode,
	updateGuest,
	archiveGuest
} from '../services/guests';

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
			ctx.throw(e);
		}
	})
	.post('/', requiresPermission('admin'), async ctx => {
		try {
			const guest = await createGuest({...ctx.request.body, createdBy: ctx.user.id, createdReason: 'comp'});

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${guest.id}`);
			ctx.status = 201;
			return ctx.body = guest;
		} catch(e) {
			if(e.code === 'INVALID') ctx.throw(400);

			ctx.throw(e);
		}
	});

guestsRouter
	.get('/:id', async ctx => {
		try {
			const guest = await getGuest(ctx.params.id);

			if(!guest) ctx.throw(404);

			return ctx.body = guest;
		} catch(e) {
			ctx.throw(e);
		}
	})
	.patch('/:id', async ctx => {
		try {
			const guest = await updateGuest(ctx.params.id, {updatedBy: ctx.user.id, ...ctx.request.body});

			return ctx.body = guest;
		} catch(e) {
			if(e.code === 'INVALID') ctx.throw(400);

			ctx.throw(e);
		}
	})
	.delete('/:id', async ctx => {
		try {
			const guest = await archiveGuest(ctx.params.id, ctx.user.id);

			return ctx.body = guest;
		} catch(e) {
			ctx.throw(e);
		}
	});

guestsRouter
	.get('/:id/ticket', async ctx => {
		try {
			const qrcode = await getCurrentGuestTicketQrCode(ctx.params.id);

			if(!qrcode) ctx.throw(404);

			return ctx.body = `<img src="${qrcode}" />`;
		} catch(e) {
			ctx.throw(e);
		}
	});

export default guestsRouter;