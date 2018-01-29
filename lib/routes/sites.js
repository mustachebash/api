const sitesRouter = require('express').Router(),
	{ authorizeUser } = require('../middleware/auth'),
	{ getSites, getSite, getSiteSettings } = require('../services/sites');

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

module.exports = sitesRouter;
