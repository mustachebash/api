const Koa = require('koa'),
	Router = require('@koa/router'),
	bodyParser = require('koa-bodyparser'),
	{ v4: uuidV4 } = require('uuid'),
	log = require('./utils/log'),
	apiRouter = require('./routes/'),
	socketService = require('./services/socket');

// Create the Koa instance
const app = new Koa(),
	appRouter = new Router(),
	npmPackageVersion = process.env.npm_package_version;

// App setup
app.proxy = true;
app.proxyIpHeader = 'X-Real-IP';

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
	ctx.requestId = (typeof ctx.headers['request-id'] === 'string' && ctx.headers['request-id']) || uuidV4();

	await next();
});

// Attach routes to the app level router
appRouter.use('/v1', apiRouter.routes());

/**
 * Attach the logger middleware
 * This will give middleware and route handlers access to ctx.log,
 * a child logger for each request
 */
app.use(async (ctx, next) => {
	ctx.log = log.child({requestId: ctx.requestId});

	await next();

	const { request, response } = ctx,
		message = `${request.method} ${request.originalUrl} ${response.status}`;

	ctx.log.info({request, response, ctx}, message);
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
		const [ seconds, nanoseconds ] = process.hrtime(start),
			{ response } = ctx;

		response.responseTime = seconds * 1e3 + nanoseconds * 1e-6;
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
 * Global error handler
 * Errors should be thrown directly from middleware and controllers to be handled here
 */
app.on('error', (err, ctx) => {
	const { request, response } = ctx;

	response.status = err.status || response.status;

	if(err.status < 500) {
		ctx.log.warn({request, response, ctx, err}, `${request.method} ${request.originalUrl} ${response.status} - ${err.message}`);
	} else {
		ctx.log.error({request, response, ctx, err}, err.message);
	}
});

const server = app.listen(4000, () => log.info(`Mustache Bash API ${process.env.npm_package_version} listening on port 4000`));

// Attach the socket server to the web server
socketService.init(server, log);
