import Router from '@koa/router';
import { authorizeUser, requiresPermission } from '../middleware/auth.js';
import { createCustomer, getCustomers, getCustomer, updateCustomer } from '../services/customers.js';

const customersRouter = new Router({
	prefix: '/customers'
});

customersRouter
	.get('/', authorizeUser, async ctx => {
		try {
			const customers = await getCustomers(ctx.query);

			return ctx.body = customers;
		} catch(e) {
			ctx.throw(e);
		}
	})
	.post('/', authorizeUser, requiresPermission('admin'), async ctx => {
		try {
			const customer = await createCustomer({...ctx.request.body, createdBy: ctx.user.id});

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${customer.id}`);
			ctx.status= 201;
			return ctx.body = customer;
		} catch(e) {
			if(e.code === 'INVALID') ctx.throw(400);

			ctx.throw(e);
		}
	});

customersRouter
	// Public route to return a customer with product object
	// TEMP: auth required for now, until customer tokens are available
	.get('/:id', authorizeUser, async ctx => {
		try {
			const customer = await getCustomer(ctx.params.id);

			return ctx.body = customer;
		} catch(e) {
			if(e.code === 'NOT_FOUND') ctx.throw(404);

			ctx.throw(e);
		}
	})
	.delete('/:id', authorizeUser, requiresPermission('admin'), async ctx => {
		try {
			const customer = await updateCustomer(ctx.params.id, {updatedBy: ctx.user.id, status: 'disabled'});

			return ctx.body = customer;
		} catch(e) {
			if(e.code === 'INVALID') ctx.throw(400);

			ctx.throw(e);
		}
	});

export default customersRouter;
