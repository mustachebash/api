const Router = require('@koa/router'),
	{ authorizeUser } = require('../middleware/auth'),
	{ getUsers, getUser } = require('../services/auth');

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
			ctx.throw(e);
		}
	});

usersRouter
	.get('/:id', async ctx => {
		try {
			const user = await getUser(ctx.params.username);

			if(!user) ctx.throw(404);

			delete user.password;
			return ctx.body = user;
		} catch(e) {
			ctx.throw(e);
		}
	});

module.exports = usersRouter;
