import { Next } from 'koa';
import { AppContext } from '../index.js';
import { validateAccessToken, checkScope } from '../services/auth.js';


export async function authorizeUser(ctx: AppContext, next: Next) {
	const authHeader = ctx.headers.authorization && ctx.headers.authorization.split(' ');

	if(!authHeader || authHeader.length !== 2 && authHeader[0] !== 'Bearer') throw ctx.throw(403);

	const accessToken = authHeader[1];

	if(!accessToken) throw ctx.throw(403);

	try {
		const { role, sub } = validateAccessToken(accessToken);

		ctx.state.user = {
			id: sub,
			role
		};
	} catch (e) {
		throw ctx.throw(401);
	}

	await next();
}

export function requiresPermission(scopeRequired: string) {
	return async (ctx: AppContext, next: Next) => {
		// Just don't even try if it's not there
		if(!ctx.state.user || !ctx.state.user.role) throw ctx.throw(403);

		if(!checkScope(ctx.state.user.role, scopeRequired)) throw ctx.throw(403);

		await next();
	};
}
