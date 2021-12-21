const Router = require('@koa/router'),
	{ authorizeUser, requiresPermission } = require('../middleware/auth'),
	{
		createGuest,
		getGuests,
		getGuest,
		createGuestTicket,
		getTicketQrCode,
		getCurrentGuestTicketQrCode,
		getGuestTickets,
		updateGuest,
		archiveGuest
	} = require('../services/guests');

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
			const guest = await createGuest({createdBy: ctx.user.username, ...ctx.request.body});

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${guest.id}`);
			ctx.status = 201;
			ctx.body = guest;
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
			const guest = await updateGuest(ctx.params.id, {updatedBy: ctx.user.username, ...ctx.request.body});

			return ctx.body = guest;
		} catch(e) {
			if(e.code === 'INVALID') ctx.throw(400);

			ctx.throw(e);
		}
	})
	.delete('/:id', async ctx => {
		try {
			const guest = await archiveGuest(ctx.params.id, ctx.user.username);

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

guestsRouter
	.get('/:id/tickets', async ctx => {
		try {
			const tickets = await getGuestTickets(ctx.params.id);

			return ctx.body = tickets;
		} catch(e) {
			ctx.throw(e);
		}
	})
	.post('/:id/tickets', requiresPermission('admin'), async ctx => {
		try {
			const ticket = await createGuestTicket(ctx.params.id, {createdBy: ctx.user.username});

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${ctx.params.id}/tickets/${ticket.id}`);
			ctx.status = 201;
			ctx.body = ticket;
		} catch(e) {
			if(e.code === 'NOT_FOUND') ctx.throw(404);
			if(e.code === 'LOCKED') ctx.throw(423);

			ctx.throw(e);
		}
	});

guestsRouter
	.get('/:id/tickets/:ticketId', async ctx => {
		try {
			const qrcode = await getTicketQrCode(ctx.params.id, ctx.params.ticketId);

			if(!qrcode) ctx.throw(404);

			ctx.body = `<img src="${qrcode}" />`;
		} catch(e) {
			ctx.throw(e);
		}
	});

module.exports = guestsRouter;
