const sitesRouter = require('express').Router(),
	{ authorizeUser } = require('../middleware/auth'),
	{ getSites, getSite, getSiteSettings, getPrivilegedSiteSettings } = require('../services/sites'),
	{ upsertEmailSubscriber } = require('../services/email');

// TODO: make this configurable at some point
const EMAIL_LIST = {
	'mustachebash.com': '90392ecd5e'
};

sitesRouter.route('/')
	.get(authorizeUser, async (req, res, next) => {
		try {
			const sites = await getSites();

			res.json(sites);
		} catch(e) {
			next(e);
		}
	});

sitesRouter.route('/:id')
	.get(authorizeUser, async (req, res, next) => {
		try {
			const site = await getSite(req.params.id);

			if(!site) return next(404);

			res.json(site);
		} catch(e) {
			next(e);
		}
	});

sitesRouter.route('/:id/mailing-list')
	.post(async (req, res, next) => {
		if(!req.body.email || !req.body.firstName || !req.body.lastName) return next(400);

		try {
			await upsertEmailSubscriber(EMAIL_LIST[req.params.id], {...req.body, tags: [`Site '${req.params.id}' Form Opt-In`]});

			res.status(204).end();
		} catch(e) {
			next(e);
		}
	});

sitesRouter.route('/:id/settings')
	.get(async (req, res, next) => {
		try {
			const settings = await getSiteSettings(req.params.id);

			if(!settings) return next(404);

			res.json(settings);
		} catch(e) {
			next(e);
		}
	});

sitesRouter.route('/:id/privileged-settings')
	.get(authorizeUser, async (req, res, next) => {
		try {
			const settings = await getPrivilegedSiteSettings(req.params.id);

			if(!settings) return next(404);

			res.json(settings);
		} catch(e) {
			next(e);
		}
	});

module.exports = sitesRouter;
