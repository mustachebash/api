/**
* Logger
*
* Class for creating a Pino logger
*/
const pino = require('pino');

function requestSerializer(request) {
	if(!request) return request;

	const reqObj = {
		method: request.method,
		url: request.originalUrl,
		headers: {...request.headers},
		remoteAddress: request.ip,
		...request.body && Object.keys(request.body).length && {body: JSON.stringify({...request.body, password: undefined})}
	};

	if(request.headers.authorization) {
		reqObj.headers.authorization = `${request.headers.authorization.substring(0, 20)}...`;
	}

	return reqObj;
}

function ctxSerializer(ctx) {
	if(!ctx) return ctx;

	const ctxObj = {};

	if(ctx.appId) ctxObj.appId = ctx.appId;
	if(ctx._matchedRoute) ctxObj.route = ctx._matchedRoute;
	if(ctx.expiredTokenData) ctxObj.expiredTokenData = ctx.expiredTokenData;

	return ctxObj;
}

function responseSerializer(response) {
	if(!response) return response;

	const resObj = {
		headers: response.headers,
		status: response.status,
		length: response.length
	};

	if(response.responseTime) resObj.responseTime = response.responseTime;

	return resObj;
}

function errSerializer(err) {
	if(!err) return err;

	const errObj = {
		...err,
		name: err.name,
		message: err.message,
		code: err.code,
		context: err.context,
		headers: err.headers,
		stack: err.stack
	};

	// This has to mutate the error to preserve other error fields, but "context" is a custom property meant only for logging anyway
	if(err.context?.isJoi) {
		errObj.context = {
			originalData: JSON.stringify(err.context._original),
			validationError: err.context.message,
			errorDetails: err.context.details
		};
	}

	return errObj;
}

const defaultPrettifier = ({ messageKey } = {messageKey: 'message'}) => {
	const chalk = require('chalk'),
		colorLevel = {
			[pino.levels.values.trace]: chalk.gray,
			[pino.levels.values.debug]: chalk.blue,
			[pino.levels.values.info]: chalk.green,
			[pino.levels.values.warn]: chalk.yellow,
			[pino.levels.values.error]: chalk.red,
			[pino.levels.values.fatal]: chalk.magenta
		};

	return (data) => {
		const { request, response, ctx, err, requestId, level, time, name, ...rest } = data,
			prefix = `${(new Date(time)).toISOString()} ${name}:`,
			levelLabel = chalk.bold(`[${pino.levels.labels[level].toUpperCase()}]`),
			ignoredKeys = ['pid', messageKey, 'hostname'],
			additionalKeys = Object.keys(rest).filter(key => !ignoredKeys.includes(key));

		// messageKey is the configured key where the log `msg` lives (default)
		let logLine = `${levelLabel} ${data[messageKey]}`;

		if(request) {
			const { body } = request,
				{ responseTime = '', length = '' } = response || {};

			logLine = `${logLine} - ${responseTime && `${responseTime}ms `}${length && `${length}bytes`}${body ? `\n  body: ${body}` : ''}`;
		}

		if(ctx && Object.keys(ctx).length) {
			logLine = `${logLine}\n  ctx: ${JSON.stringify(ctx)}`;
		}

		if(requestId) {
			logLine = `${logLine}\n  requestId: ${requestId}`;
		}

		additionalKeys.forEach(key => logLine = `${logLine}\n  ${key}: ${typeof rest[key] === 'string' ? rest[key] : JSON.stringify(rest[key])}`);

		if(err) {
			const { code, context, stack } = err;
			logLine = `${logLine}\n  ${code ? `err.code: ${chalk.bold(code)}\n  ` : ''}${context ? `err.context: ${JSON.stringify(context)}\n  ` : ''}${stack}`;
		}

		return `${prefix} ${colorLevel[level](logLine)}\n`;
	};
};

const NODE_ENV = process.env.NODE_ENV,
	logLevel = process.env.LOG_LEVEL || (NODE_ENV !== 'production' ? 'debug' : 'info'),
	logger = pino({
		name: 'Mustache Bash API Logger',
		level: logLevel,
		prettyPrint: NODE_ENV !== 'production',
		prettifier: NODE_ENV !== 'production' && defaultPrettifier,
		serializers: {
			request: requestSerializer,
			response: responseSerializer,
			ctx: ctxSerializer,
			err: errSerializer
		}
	});

module.exports = logger;
