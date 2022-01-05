const Router = require('@koa/router'),
	{ authorizeUser, requiresPermission } = require('../middleware/auth'),
	{ getSites, getSite, getSiteSettings, updateSiteSettings, getPrivilegedSiteSettings } = require('../services/sites'),
	{ upsertEmailSubscriber } = require('../services/email');

// TODO: make this configurable at some point
const EMAIL_LIST = {
	'mustachebash.com': '90392ecd5e'
};

const sitesRouter = new Router({
	prefix: '/sites'
});

sitesRouter
	.get('/', authorizeUser, async ctx => {
		try {
			const sites = await getSites();

			return ctx.body = sites;
		} catch(e) {
			ctx.throw(e);
		}
	});

sitesRouter
	.get('/:id', authorizeUser, async ctx => {
		try {
			const site = await getSite(ctx.params.id);

			if(!site) ctx.throw(404);

			return ctx.body = site;
		} catch(e) {
			ctx.throw(e);
		}
	});

sitesRouter
	.post('/:id/mailing-list', async ctx => {
		if(!ctx.request.body.email || !ctx.request.body.firstName || !ctx.request.body.lastName) ctx.throw(400);

		try {
			await upsertEmailSubscriber(EMAIL_LIST[ctx.params.id], {...ctx.request.body, tags: [`Site '${ctx.params.id}' Form Opt-In`]});

			return ctx.status = 204;
		} catch(e) {
			ctx.throw(e);
		}
	});

sitesRouter
	.get('/:id/settings', async ctx => {
		try {
			const settings = await getSiteSettings(ctx.params.id);

			if(!settings) ctx.throw(404);

			return ctx.body = settings;
		} catch(e) {
			ctx.throw(e);
		}
	})
	.patch('/:id/settings', authorizeUser, requiresPermission('god'), async ctx => {
		try {
			const site = await updateSiteSettings(ctx.params.id, ctx.request.body);

			if(!site) ctx.throw(404);

			return ctx.body = site;
		} catch(e) {
			ctx.throw(e);
		}
	});

sitesRouter
	.get('/:id/privileged-settings', authorizeUser, async ctx => {
		try {
			const settings = await getPrivilegedSiteSettings(ctx.params.id);

			if(!settings) ctx.throw(404);

			return ctx.body = settings;
		} catch(e) {
			ctx.throw(e);
		}
	});

module.exports = sitesRouter;
