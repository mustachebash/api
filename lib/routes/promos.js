const Router = require('@koa/router'),
	{ authorizeUser, requiresPermission } = require('../middleware/auth'),
	{ createPromo, getPromos, getPromo, updatePromo } = require('../services/promos'),
	{ getProduct } = require('../services/products');

const promosRouter = new Router({
	prefix: '/promos'
});

promosRouter
	.get('/', authorizeUser, async ctx => {
		try {
			const promos = await getPromos(ctx.query);

			return ctx.body = promos;
		} catch(e) {
			ctx.throw(e);
		}
	})
	.post('/', authorizeUser, requiresPermission('admin'), async ctx => {
		try {
			const promo = await createPromo({createdBy: ctx.user.username, ...ctx.request.body});

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${promo.id}`);
			ctx.status= 201;
			return ctx.body = promo;
		} catch(e) {
			if(e.code === 'INVALID') ctx.throw(400);

			ctx.throw(e);
		}
	});

promosRouter
	// Public route to return a promo with product object
	.get('/:id', async ctx => {
		try {
			const promo = await getPromo(ctx.params.id);

			if(!promo) ctx.throw(404);
			// If the promo has been used, return 410 GONE
			if(promo.status !== 'active') ctx.throw(410);

			const product = await getProduct(promo.productId);
			delete promo.productId;

			// if the product is no longer available, return 410 GONE
			if(product.status !== 'active') ctx.throw(410);

			promo.product = {
				id: product.id,
				price: product.price,
				description: product.description,
				name: product.name
			};

			return ctx.body = promo;
		} catch(e) {
			ctx.throw(e);
		}
	})
	.delete('/:id', authorizeUser, requiresPermission('admin'), async ctx => {
		try {
			const promo = await updatePromo(ctx.params.id, {updatedBy: ctx.user.username, status: 'disabled'});

			return ctx.body = promo;
		} catch(e) {
			if(e.code === 'INVALID') ctx.throw(400);

			ctx.throw(e);
		}
	});

module.exports = promosRouter;
