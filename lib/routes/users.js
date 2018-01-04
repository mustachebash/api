const usersRouter = require('express').Router(),
	{ createUser, getUsers, getUser } = require('../services/auth');

usersRouter.route('/')
	.get(async (req, res, next) => {
		try {
			const users = await getUsers();

			res.json(users);
		} catch(e) {
			next(e);
		}
	})
	.post(async (req, res, next) => {
		if(!req.body.username || !req.body.password) return next(400);

		try {
			const userId = await createUser(req.body);

			res.status(201).json(userId);
		} catch(e) {
			next(e);
		}
	});

usersRouter.route('/:username')
	.get(async (req, res, next) => {
		try {
			const user = await getUser(req.params.username);

			if(!user) return next(404);

			res.json(user);
		} catch(e) {
			next(e);
		}
	});

module.exports = usersRouter;
