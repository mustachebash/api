const promosRouter = require('express').Router(),
	{ authorizeUser, requiresPermission } = require('../middleware/auth'),
	{ createPromo, getPromos, getPromo, updatePromo } = require('../services/promos'),
	{ getProduct } = require('../services/products');

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
	// Public route to return a promo with product object
	.get(async (req, res, next) => {
		try {
			const promo = await getPromo(req.params.id);

			if(!promo) return next(404);
			// If the promo has been used, return 410 GONE
			if(promo.status !== 'active') return next(410);

			const product = await getProduct(promo.productId);
			delete promo.productId;

			// if the product is no longer available, return 410 GONE
			if(product.status !== 'active') return next(410);

			promo.product = {
				id: product.id,
				price: product.price,
				description: product.description,
				name: product.name
			};

			res.json(promo);
		} catch(e) {
			next(e);
		}
	})
	.delete(authorizeUser, requiresPermission('admin'), async (req, res, next) => {
		try {
			const promo = await updatePromo(req.params.id, {updatedBy: req.user.username, status: 'disabled'});

			res.json(promo);
		} catch(e) {
			if(e.code === 'INVALID') return next(400);

			next(e);
		}
	});

module.exports = promosRouter;
