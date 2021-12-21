const Router = require('@koa/router'),
	{ authorizeUser } = require('../middleware/auth'),
	{ createProduct, getProducts, getProduct, updateProduct } = require('../services/products');

const productsRouter = new Router({
	prefix: '/products'
});

productsRouter.use(authorizeUser);

productsRouter
	.get('/', async ctx => {
		try {
			const products = await getProducts();

			return ctx.body = products;
		} catch(e) {
			ctx.throw(e);
		}
	})
	.post('/', async ctx => {
		try {
			const product = await createProduct(ctx.request.body);

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${product.id}`);
			ctx.status = 201;
			return ctx.body = product;
		} catch(e) {
			if(e.code === 'INVALID') ctx.throw(400);

			ctx.throw(e);
		}
	});

productsRouter
	.get('/:id', async ctx => {
		try {
			const product = await getProduct(ctx.params.id);

			if(!product) ctx.throw(404);

			return ctx.body = product;
		} catch(e) {
			ctx.throw(e);
		}
	})
	.patch('/:id', async ctx => {
		try {
			const product = await updateProduct(ctx.params.id, ctx.request.body);

			return ctx.body = product;
		} catch(e) {
			if(e.code === 'INVALID') ctx.throw(400);

			ctx.throw(e);
		}
	});

module.exports = productsRouter;
