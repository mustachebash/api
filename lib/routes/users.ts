import Router from '@koa/router';
import { authorizeUser } from '../middleware/auth.js';
import { getUsers, getUser } from '../services/auth.js';

const usersRouter = new Router({
	prefix: '/users'
});

usersRouter.use(authorizeUser);

usersRouter
	.get('/', async ctx => {
		try {
			const users = await getUsers();

			return ctx.body = users;
		} catch(e) {
			throw ctx.throw(e);
		}
	});

usersRouter
	.get('/:id', async ctx => {
		try {
			const user = await getUser(ctx.params.username);

			if(!user) throw ctx.throw(404);

			delete user.password;
			return ctx.body = user;
		} catch(e) {
			throw ctx.throw(e);
		}
	});

export default usersRouter;
