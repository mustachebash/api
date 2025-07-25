import Koa, { HttpError } from 'koa';
import type { DefaultState, ParameterizedContext, Middleware, Context, Next } from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import { v4 as uuidV4 } from 'uuid';
import log, { Logger } from './utils/log.js';
import apiRouter from './routes/index.js';

type JSONValue = string | number | boolean | null | { [x: string]: JSONValue | unknown } | Array<JSONValue>;

interface MustacheBashState extends DefaultState {
	user: {
		id: string;
		role: string;
	};
	accessToken: string;
	requestId: string;
	log: Logger;
	responseTime: number;
}

interface MustacheBashContext extends Context {
	// prevent accidental usage at the wrong level (since ctx string indexes are typed as "any")
	log: never;
	user: never;

	body: JSONValue;
}

// Create the Koa instance
const app = new Koa<MustacheBashState, MustacheBashContext>(),
	npmPackageVersion: string = process.env.npm_package_version as string;

/**
 * Export some types for usage in middleware and routers
 */
export type AppContext = ParameterizedContext<MustacheBashState, MustacheBashContext, JSONValue>;
export type AppMiddleware = Middleware<MustacheBashState, MustacheBashContext, JSONValue>;
export { Next };

const appRouter = new Router<AppContext['state'], AppContext>();

// App setup
app.proxy = true;
app.proxyIpHeader = 'X-Real-IP';

/**
 * Global error handler
 * Errors should be thrown directly from middleware and controllers to be handled here
 */
app.use(async (ctx, next) => {
	try {
		await next();
	} catch(e) {
		if(e instanceof HttpError) {
			ctx.status = e.status

			ctx.body = e.expose ? e.message : 'Internal Server Error';
		} else if(e instanceof Error) {
			ctx.status = 500;
			ctx.body = 'Internal Server Error';
		}

		ctx.app.emit('error', e, ctx);
	}
});

/**
 * Attach API Version Header
 */
app.use(async (ctx, next) => {
	ctx.set('Api-Version', npmPackageVersion);

	await next();
});

/**
 * Attach a request id from downstream, or create one
 */
app.use(async (ctx, next) => {
	ctx.state.requestId = (typeof ctx.headers['request-id'] === 'string' && ctx.headers['request-id']) || uuidV4();

	await next();
});

// Attach routes to the app level router
appRouter.use('/v1', apiRouter.routes());

/**
 * Attach CORS middleware
 */
// Cache this env value since it's checked on every request
const corsEnv = process.env.NODE_ENV;
app.use(
	cors({
		keepHeadersOnError: true,
		maxAge: 1728000,
		origin(ctx) {
			const origin = ctx.get('origin');

			// Accept dev origins only in non-production environments
			if(
				corsEnv !== 'production'
				&& (
					/^https?:\/\/localhost(:\d*)?$/.test(origin) ||
					/^https:\/\/.+\.local\.mrstache\.io$/.test(origin)
				)
			) {
				return origin;
			}

			// Mustache bash root and single subdomain, HTTPS only
			if(/^https:\/\/(\w+\.)?mustachebash\.com$/.test(origin)) {
				return origin;
			}

			return '';
		},
		credentials(ctx) {
			const origin = ctx.get('origin');

			// Accept dev origins only in non-production environments
			if(corsEnv !== 'production' && /^https?:\/\/localhost(:\d*)?$/.test(origin)) {
				return true;
			}

			// Mustache bash root and single subdomain, HTTPS only
			if(/^https:\/\/(\w+\.)?mustachebash\.com$/.test(origin)) {
				return true;
			}

			return false;
		},
		allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
		allowHeaders: [
			'Accept',
			'Authorization',
			'Cache-Control',
			'Content-Type',
			'DNT',
			'If-Modified-Since',
			'Keep-Alive',
			'Origin',
			'User-Agent',
			'X-Requested-With'
		],
		exposeHeaders: [
			'Location',
			'Retry-After',
			'Warning'
		]
	})
);

/**
 * Attach the logger middleware
 * This will give middleware and route handlers access to ctx.state.log,
 * a child logger for each request
 */
app.use(async (ctx, next) => {
	ctx.state.log = log.child({requestId: ctx.requestId});

	await next();

	const { request, response } = ctx,
		message = `${request.method} ${request.originalUrl} ${response.status}`;

	ctx.state.log.info({request, response, ctx}, message);
});

/**
 * Attach response times
 */
app.use(async (ctx, next) => {
	// Hi-res time
	const start = process.hrtime();

	try {
		await next();
	} finally {
		const [ seconds, nanoseconds ] = process.hrtime(start);

		ctx.state.responseTime = seconds * 1e3 + nanoseconds * 1e-6;
	}
});

/**
 * Attach request body parser
 */
app.use(bodyParser());

/**
 * Attach the main router and all routes to the app
 */
app.use(appRouter.routes());

/**
 * Catch all other requests
 */
app.use(ctx => ctx.throw(404));

/**
 * Global error logger
 * Errors should be thrown directly from middleware and controllers to be handled here
 */
app.on('error', (err, ctx) => {
	const { request, response } = ctx;

	response.status = err.status || response.status;

	if(err.status < 500) {
		ctx.state.log.warn({request, response, ctx, err}, `${request.method} ${request.originalUrl} ${response.status} - ${err.message}`);
	} else {
		ctx.state.log.error({request, response, ctx, err}, err.message);
	}
});

app.listen(4000, () => log.info(`Mustache Bash API ${process.env.npm_package_version} listening on port 4000`));
