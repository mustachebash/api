import Router from '@koa/router';
import { authorizeUser } from '../middleware/auth.js';
import { getUsers, getUser } from '../services/auth.js';
import { AppContext } from '../index.js';
import { isServiceError } from '../utils/type-guards.js';

const usersRouter = new Router<AppContext['state'], AppContext>({
	prefix: '/users'
});

usersRouter.use(authorizeUser);

usersRouter.get('/', async ctx => {
	try {
		const users = await getUsers();

		return (ctx.body = users);
	} catch (e) {
		if (e instanceof Error) throw ctx.throw(e);
		throw e;
	}
});

usersRouter.get('/:id', async ctx => {
	try {
		const user = await getUser(ctx.params.username);

		if (!user) throw ctx.throw(404);

		delete user.password;
		return (ctx.body = user);
	} catch (e) {
		if (e instanceof Error) throw ctx.throw(e);
		throw e;
	}
});

export default usersRouter;
