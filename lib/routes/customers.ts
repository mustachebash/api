import Router from '@koa/router';
import { AppContext } from '../index.js';
import { authorizeUser, requiresPermission } from '../middleware/auth.js';
import { createCustomer, getCustomers, getCustomer, updateCustomer } from '../services/customers.js';

const customersRouter = new Router<AppContext['state'], AppContext>({
	prefix: '/customers'
});

customersRouter
	.get('/', authorizeUser, async ctx => {
		try {
			const customers = await getCustomers(ctx.query);

			return ctx.body = customers;
		} catch(e) {
			throw ctx.throw(e);
		}
	})
	.post('/', authorizeUser, requiresPermission('admin'), async ctx => {
		try {
			const customer = await createCustomer({...ctx.request.body, createdBy: ctx.state.user.id});

			ctx.set('Location', `https://${ctx.host}${ctx.path}/${customer.id}`);
			ctx.status= 201;
			return ctx.body = customer;
		} catch(e) {
			if(e.code === 'INVALID') throw ctx.throw(400);

			throw ctx.throw(e);
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
			if(e.code === 'NOT_FOUND') throw ctx.throw(404);

			throw ctx.throw(e);
		}
	})
	.delete('/:id', authorizeUser, requiresPermission('admin'), async ctx => {
		try {
			const customer = await updateCustomer(ctx.params.id, {updatedBy: ctx.state.user.id, status: 'disabled'});

			return ctx.body = customer;
		} catch(e) {
			if(e.code === 'INVALID') throw ctx.throw(400);

			throw ctx.throw(e);
		}
	});

export default customersRouter;
