/**
* Logger
*
* Class for creating a Pino logger
*/
import { pino } from 'pino';

import type { AppContext } from '../index.js';

export type { Logger } from 'pino';

function levelToSeverity(level: number) {
	switch (level) {
		case pino.levels.values.trace:
		case pino.levels.values.debug:
			return 'DEBUG';

		case pino.levels.values.info:
			return 'INFO';

		case pino.levels.values.warn:
			return 'WARNING';

		case pino.levels.values.error:
			return 'ERROR';

		case pino.levels.values.fatal:
			return 'CRITICAL';

		default:
			return 'DEFAULT';
	}
}

function stackdriverFormatter(
	obj: object & {
		ctx?: AppContext;
		request?: AppContext['request'];
		response?: AppContext['response'];
		httpRequest?: Record<string, unknown>;
	}
) {
	const { request, response, ctx } = obj;
	if (request) {
		obj.httpRequest = {
			requestMethod: request.method,
			requestUrl: request.href,
			remoteIp: request.ip,
			referer: request.headers.referer,
			status: response?.status,
			userAgent: request.headers['user-agent'],
			...(ctx?.state.responseTime && {
				// responseTime is in milliseconds
				latency: `${ctx.state.responseTime / 1000}s`
			}),
			responseSize: response?.length
		};
	}

	return obj;
}

function requestSerializer(request: AppContext['request']) {
	if(!request) return request;

	const reqObj = {
		method: request.method,
		url: request.originalUrl,
		headers: {...request.headers},
		remoteAddress: request.ip
	};

	if(request.headers.authorization) {
		reqObj.headers.authorization = `${request.headers.authorization.substring(0, 20)}...`;
	}

	return reqObj;
}

function ctxSerializer(ctx: AppContext) {
	if(!ctx) return ctx;

	const ctxObj: Record<string, unknown> = {};

	if(ctx._matchedRoute) ctxObj.route = ctx._matchedRoute;
	if(ctx.expiredTokenData) ctxObj.expiredTokenData = ctx.expiredTokenData;
	if(ctx.state.responseTime) ctxObj.responseTime = ctx.state.responseTime;

	return ctxObj;
}

function responseSerializer(response: AppContext['response']) {
	if(!response) return response;

	const resObj = {
		headers: response.headers,
		status: response.status,
		length: response.length
	};

	return resObj;
}

function errSerializer(err: Record<string, unknown> & { context?: Record<string, unknown> }) {
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

	return errObj;
}

const NODE_ENV = process.env.NODE_ENV,
	logLevel = process.env.LOG_LEVEL || (NODE_ENV !== 'production' ? 'debug' : 'info'),
	logger = pino({
		name: 'Mustache Bash API Logger',
		level: logLevel,
		// This is for StackDriver
		messageKey: 'message',
		...(NODE_ENV === 'production' && {
			formatters: {
				log: stackdriverFormatter,
				level: (_label, number) => ({ severity: levelToSeverity(number) })
			}
		}),
		...(NODE_ENV !== 'production' && {
			transport: {
				target: './log-prettifier.js'
			}
		}),
		serializers: {
			request: requestSerializer,
			response: responseSerializer,
			ctx: ctxSerializer,
			err: errSerializer
		}
	});

export default logger;
