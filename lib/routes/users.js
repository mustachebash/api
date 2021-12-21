const Router = require('@koa/router'),
	{ authorizeUser, requiresPermission } = require('../middleware/auth'),
	{ createUser, getUsers, getUser, updateUser } = require('../services/auth');

const usersRouter = new Router({
	prefix: '/users'
});

usersRouter.use(authorizeUser);

usersRouter
	.get('/', async (req, res, next) => {
		try {
			const users = await getUsers();

			res.json(users);
		} catch(e) {
			next(e);
		}
	})
	.post('/', requiresPermission('god'), async (req, res, next) => {
		if(!req.body.username || !req.body.password) return next(400);

		try {
			const user = await createUser(req.body);

			delete user.password;
			res.location(`https://${req.get('host')}${req.baseUrl}/${user.id}`);
			res.status(201).json(user);
		} catch(e) {
			next(e);
		}
	});

usersRouter
	.get('/:username', async (req, res, next) => {
		try {
			const user = await getUser(req.params.username);

			if(!user) return next(404);

			delete user.password;
			res.json(user);
		} catch(e) {
			next(e);
		}
	})
	.patch('/:username', requiresPermission('god'), async (req, res, next) => {
		try {
			const user = await updateUser(req.params.username, req.body);

			delete user.password;
			res.json(user);
		} catch(e) {
			next(e);
		}
	});

module.exports = usersRouter;
