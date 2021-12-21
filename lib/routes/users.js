const Router = require('@koa/router'),
	{ authorizeUser, requiresPermission } = require('../middleware/auth'),
	{ createUser, getUsers, getUser, updateUser } = require('../services/auth');

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
	})
	.post('/', requiresPermission('god'), async ctx => {
		if(!ctx.request.body.username || !ctx.request.body.password) ctx.throw(400);

		try {
			const user = await createUser(ctx.request.body);

			delete user.password;
			ctx.set('Location', `https://${ctx.host}${ctx.path}/${user.id}`);
			ctx.status = 201;
			return ctx.body = user;
		} catch(e) {
			ctx.throw(e);
		}
	});

usersRouter
	.get('/:username', async ctx => {
		try {
			const user = await getUser(ctx.params.username);

			if(!user) ctx.throw(404);

			delete user.password;
			return ctx.body = user;
		} catch(e) {
			ctx.throw(e);
		}
	})
	.patch('/:username', requiresPermission('god'), async ctx => {
		try {
			const user = await updateUser(ctx.params.username, ctx.request.body);

			delete user.password;
			return ctx.body = user;
		} catch(e) {
			ctx.throw(e);
		}
	});

module.exports = usersRouter;
