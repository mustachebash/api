import Router from '@koa/router';
import { authorizeUser } from '../middleware/auth.js';
import { createProduct, getProducts, getProduct, updateProduct } from '../services/products.js';
import { isServiceError } from '../utils/type-guards.js';
import { validateProductCreate, validateProductUpdate } from '../utils/validation.js';
import { AppContext } from '../index.js';

const productsRouter = new Router<AppContext['state'], AppContext>({
	prefix: '/products'
});

productsRouter.use(authorizeUser);

productsRouter
	.get('/', async ctx => {
		try {
			const products = await getProducts(ctx.query);

			return (ctx.body = products);
		} catch (e) {
			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	})
	.post('/', async ctx => {
		const validation = validateProductCreate(ctx.request.body);
		if (!validation.valid) throw ctx.throw(400, validation.error, { expose: false });

		try {
			const product = await createProduct(validation.data);

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${product.id}`);
			ctx.status = 201;
			return (ctx.body = product);
		} catch (e) {
			if (isServiceError(e) && e.code === 'INVALID') throw ctx.throw(400, e, { expose: false });

			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	});

productsRouter
	.get('/:id', async ctx => {
		try {
			const product = await getProduct(ctx.params.id);

			if (!product) throw ctx.throw(404);

			return (ctx.body = product);
		} catch (e) {
			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	})
	.patch('/:id', async ctx => {
		const validation = validateProductUpdate(ctx.request.body);
		if (!validation.valid) throw ctx.throw(400, validation.error, { expose: false });

		try {
			const product = await updateProduct(ctx.params.id, { ...validation.data, updatedBy: ctx.state.user!.id });

			return (ctx.body = product);
		} catch (e) {
			if (isServiceError(e) && e.code === 'INVALID') throw ctx.throw(400, e, { expose: false });

			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	});

export default productsRouter;
