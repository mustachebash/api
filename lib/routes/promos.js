const promosRouter = require('express').Router(),
	{ authorizeUser, requiresPermission } = require('../middleware/auth'),
	{ createPromo, getPromos, getPromo, updatePromo } = require('../services/promos');

promosRouter.route('/')
	.get(authorizeUser, async (req, res, next) => {
		try {
			const promos = await getPromos();

			res.json(promos);
		} catch(e) {
			next(e);
		}
	})
	.post(authorizeUser, requiresPermission('admin'), async (req, res, next) => {
		try {
			const promo = await createPromo({createdBy: req.user.username, ...req.body});

			res.location(`https://${req.get('host')}${req.baseUrl}/${promo.id}`);
			res.status(201).json(promo);
		} catch(e) {
			if(e.code === 'INVALID') return next(400);

			next(e);
		}
	});

promosRouter.route('/:id')
	.get(async (req, res, next) => {
		try {
			const promo = await getPromo(req.params.id);

			if(!promo) return next(404);

			res.json(promo);
		} catch(e) {
			next(e);
		}
	})
	.patch(authorizeUser, requiresPermission('admin'), async (req, res, next) => {
		try {
			const promo = await updatePromo(req.params.id, {updatedBy: req.user.username, ...req.body});

			res.json(promo);
		} catch(e) {
			if(e.code === 'INVALID') return next(400);

			next(e);
		}
	});

module.exports = promosRouter;
