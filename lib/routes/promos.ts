import Router from '@koa/router';
import { authorizeUser, requiresPermission } from '../middleware/auth.js';
import { createPromo, getPromos, getPromo, updatePromo } from '../services/promos.js';
import { getProduct } from '../services/products.js';

const promosRouter = new Router({
	prefix: '/promos'
});

promosRouter
	.get('/', authorizeUser, async ctx => {
		try {
			const promos = await getPromos(ctx.query);

			return ctx.body = promos;
		} catch(e) {
			throw ctx.throw(e);
		}
	})
	.post('/', authorizeUser, requiresPermission('write'), async ctx => {
		try {
			const promo = await createPromo({...ctx.request.body, createdBy: ctx.state.user.id});

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${promo.id}`);
			ctx.status= 201;
			return ctx.body = promo;
		} catch(e) {
			if(e.code === 'INVALID') throw ctx.throw(400);

			throw ctx.throw(e);
		}
	});

promosRouter
	// Public route to return a promo with product object
	.get('/:id', async ctx => {
		try {
			const promo = await getPromo(ctx.params.id);

			if(!promo) throw ctx.throw(404);
			// If the promo has been used, return 410 GONE
			if(promo.status !== 'active') throw ctx.throw(410);

			const product = await getProduct(promo.productId);
			delete promo.productId;

			// if the product is no longer available, return 410 GONE
			if(product.status !== 'active') throw ctx.throw(410);

			promo.product = {
				id: product.id,
				price: product.price,
				description: product.description,
				name: product.name
			};

			return ctx.body = promo;
		} catch(e) {
			throw ctx.throw(e);
		}
	})
	.delete('/:id', authorizeUser, requiresPermission('write'), async ctx => {
		try {
			const promo = await updatePromo(ctx.params.id, {updatedBy: ctx.state.user.id, status: 'disabled'});

			return ctx.body = promo;
		} catch(e) {
			if(e.code === 'INVALID') throw ctx.throw(400);

			throw ctx.throw(e);
		}
	});

export default promosRouter;
