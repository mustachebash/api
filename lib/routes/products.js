import Router from '@koa/router';
import { authorizeUser } from '../middleware/auth.js';
import { createProduct, getProducts, getProduct, updateProduct } from '../services/products.js';

const productsRouter = new Router({
	prefix: '/products'
});

productsRouter.use(authorizeUser);

productsRouter
	.get('/', async ctx => {
		try {
			const products = await getProducts(ctx.query);

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
			if(e.code === 'INVALID') ctx.throw(400, e);

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
			const product = await updateProduct(ctx.params.id, {...ctx.request.body, updatedBy: ctx.user.id});

			return ctx.body = product;
		} catch(e) {
			if(e.code === 'INVALID') ctx.throw(400);

			ctx.throw(e);
		}
	});

export default productsRouter;
