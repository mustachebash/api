const { validateAccessToken } = require('../services/auth');

module.exports = {
	authorizeUser(req, res, next) {
		const authHeader = req.headers.authorization && req.headers.authorization.split(' ');

		if(!authHeader || authHeader.length !== 2 && authHeader[0] !== 'Bearer') return next(403);

		const accessToken = authHeader[1];

		if(!accessToken) return next(403);

		try {
			const { role, sub } = validateAccessToken(accessToken);

			req.user = {
				username: sub,
				role
			};

			next();
		} catch (e) {
			return next(401);
		}
	}
};
