const Router = require('@koa/router'),
	{ upsertEmailSubscriber } = require('../services/email');

// TODO: make this configurable at some point
const EMAIL_LIST_ID = '90392ecd5e';

const sitesRouter = new Router({
	prefix: '/sites'
});

// Keeping this unti the front end is updated to hit a different route
sitesRouter
	.post('/:id/mailing-list', async ctx => {
		if(!ctx.request.body.email || !ctx.request.body.firstName || !ctx.request.body.lastName) ctx.throw(400);

		try {
			await upsertEmailSubscriber(EMAIL_LIST_ID, {...ctx.request.body, tags: [`Site '${ctx.params.id}' Form Opt-In`]});

			return ctx.status = 204;
		} catch(e) {
			ctx.throw(e);
		}
	});

module.exports = sitesRouter;
