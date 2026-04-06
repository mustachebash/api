import Router from '@koa/router';
import { authorizeUser, requiresPermission } from '../middleware/auth.js';
import { createPromo, getPromos, getPromo, updatePromo } from '../services/promos.js';
import { createCompOrder } from '../services/orders.js';
import { getProduct } from '../services/products.js';
import { sendCompReceipt, upsertEmailSubscriber } from '../services/email.js';
import { isServiceError } from '../utils/type-guards.js';
import { validatePromoCreate } from '../utils/validation.js';
import { AppContext } from '../index.js';

const EMAIL_LIST = '90392ecd5e',
	EMAIL_TAG = 'Mustache Bash 2027 Attendee';

const promosRouter = new Router<AppContext['state'], AppContext>({
	prefix: '/promos'
});

promosRouter
	.get('/', authorizeUser, async ctx => {
		try {
			const promos = await getPromos(ctx.query);

			return (ctx.body = promos);
		} catch (e) {
			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	})
	.post('/', authorizeUser, requiresPermission('write'), async ctx => {
		const validation = validatePromoCreate(ctx.request.body);
		if (!validation.valid) throw ctx.throw(400, validation.error, { expose: false });

		try {
			const promo = await createPromo({ ...validation.data, createdBy: ctx.state.user!.id });

			if (promo.type === 'single-use' && promo.price === 0 && promo.recipientEmail) {
				const nameParts = (promo.recipientName ?? '').trim().split(' ');
				const firstName = nameParts[0];
				const lastName = nameParts.slice(1).join(' ') || '-';

				try {
					const { orderToken } = await createCompOrder({ promo });
					sendCompReceipt(firstName, lastName, promo.recipientEmail, orderToken);
					upsertEmailSubscriber(EMAIL_LIST, { email: promo.recipientEmail, firstName, lastName, tags: [EMAIL_TAG] });
				} catch (e) {
					ctx.state.log.error(e, 'Error creating comp order');
				}
			}

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${promo.id}`);
			ctx.status = 201;
			return (ctx.body = promo);
		} catch (e) {
			if (isServiceError(e) && e.code === 'INVALID') throw ctx.throw(400, e, { expose: false });

			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	});

promosRouter
	// Public route to return a promo with product object
	.get('/:id', async ctx => {
		try {
			const promo = await getPromo(ctx.params.id);

			if (promo.type === 'single-use') {
				if (!promo) throw ctx.throw(404);
				// If the promo has been used, return 410 GONE
				if (promo.status !== 'active') throw ctx.throw(410);

				const product = await getProduct(promo.productId);

				// if the product is no longer available, return 410 GONE
				if (product.status !== 'active') throw ctx.throw(410);

				return (ctx.body = {
					...promo,
					product: {
						id: product.id,
						price: product.price,
						description: product.description,
						name: product.name
					}
				});
			}

			return (ctx.body = promo);
		} catch (e) {
			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	})
	.delete('/:id', authorizeUser, requiresPermission('write'), async ctx => {
		try {
			const promo = await updatePromo(ctx.params.id, { updatedBy: ctx.state.user!.id, status: 'disabled' });

			return (ctx.body = promo);
		} catch (e) {
			if (isServiceError(e) && e.code === 'INVALID') throw ctx.throw(400);

			if (e instanceof Error) throw ctx.throw(e);
			throw e;
		}
	});

export default promosRouter;
