const productsRouter = require('express').Router(),
	{ createProduct, getProducts, getProduct, updateProduct } = require('../services/products');

productsRouter.route('/')
	.get(async (req, res, next) => {
		try {
			const products = await getProducts();

			res.json(products);
		} catch(e) {
			next(e);
		}
	})
	.post(async (req, res, next) => {
		try {
			const product = await createProduct(req.body);

			res.location(`https://${req.get('host')}${req.baseUrl}/${product.id}`);
			res.status(201).json(product);
		} catch(e) {
			if(e.code === 'INVALID') return next(400);

			next(e);
		}
	});

productsRouter.route('/:id')
	.get(async (req, res, next) => {
		try {
			const product = await getProduct(req.params.id);

			if(!product) return next(404);

			res.json(product);
		} catch(e) {
			next(e);
		}
	})
	.patch(async (req, res, next) => {
		try {
			const product = await updateProduct(req.params.id, req.body);

			res.json(product);
		} catch(e) {
			if(e.code === 'INVALID') return next(400);

			next(e);
		}
	});

module.exports = productsRouter;
