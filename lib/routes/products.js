const Router = require('@koa/router'),
	{ authorizeUser } = require('../middleware/auth'),
	{ createProduct, getProducts, getProduct, updateProduct } = require('../services/products');

const productsRouter = new Router({
	prefix: '/products'
});

productsRouter.use(authorizeUser);

productsRouter
	.get('/', async (req, res, next) => {
		try {
			const products = await getProducts();

			res.json(products);
		} catch(e) {
			next(e);
		}
	})
	.post('/', async (req, res, next) => {
		try {
			const product = await createProduct(req.body);

			res.location(`https://${req.get('host')}${req.baseUrl}/${product.id}`);
			res.status(201).json(product);
		} catch(e) {
			if(e.code === 'INVALID') return next(400);

			next(e);
		}
	});

productsRouter
	.get('/:id', async (req, res, next) => {
		try {
			const product = await getProduct(req.params.id);

			if(!product) return next(404);

			res.json(product);
		} catch(e) {
			next(e);
		}
	})
	.patch('/:id', async (req, res, next) => {
		try {
			const product = await updateProduct(req.params.id, req.body);

			res.json(product);
		} catch(e) {
			if(e.code === 'INVALID') return next(400);

			next(e);
		}
	});

module.exports = productsRouter;
