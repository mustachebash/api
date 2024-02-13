import { validateAccessToken, checkScope } from '../services/auth.js';


export async function authorizeUser(ctx, next) {
	const authHeader = ctx.headers.authorization && ctx.headers.authorization.split(' ');

	if(!authHeader || authHeader.length !== 2 && authHeader[0] !== 'Bearer') ctx.throw(403);

	const accessToken = authHeader[1];

	if(!accessToken) ctx.throw(403);

	try {
		const { role, sub } = validateAccessToken(accessToken);

		ctx.state.user = {
			id: sub,
			username: sub,
			role
		};
	} catch (e) {
		ctx.throw(401);
	}

	await next();
}

export function requiresPermission(scopeRequired) {
	return async (ctx, next) => {
		// Just don't even try if it's not there
		if(!ctx.user || !ctx.user.role) ctx.throw(403);

		if(!checkScope(ctx.user.role, scopeRequired)) ctx.throw(403);

		await next();
	};
}