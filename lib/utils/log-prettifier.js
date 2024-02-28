/**
 * This file must be .js instead of .ts because pino's transport functionality spawns this file in a worker thread, which
 * will attempt (and fail) to use ts-node. Typing is not important for this file either, since it's only used in local dev
 */
import { pino } from 'pino';
import chalk from 'chalk';
import pretty from 'pino-pretty';

export default async () => {
	const colorLevel = {
		[pino.levels.values.trace]: chalk.gray,
		[pino.levels.values.debug]: chalk.blue,
		[pino.levels.values.info]: chalk.green,
		[pino.levels.values.warn]: chalk.yellow,
		[pino.levels.values.error]: chalk.red,
		[pino.levels.values.fatal]: chalk.magenta
	};

	const defaultPrettifier = (log, messageKey) => {
		const { level, request, response, ctx, err, requestId, time, name, ...rest } = log,
			prefix = `${new Date(time).toISOString()} ${name}:`,
			levelLabel = chalk.bold(`[${pino.levels.labels[level].toUpperCase()}]`),
			ignoredKeys = ['pid', messageKey, 'hostname'],
			additionalKeys = Object.keys(rest).filter(key => !ignoredKeys.includes(key));

		// messageKey is the configured key where the log `msg` lives (default)
		let logLine = `${levelLabel} ${log[messageKey]}`;

		if (request) {
			const { body } = request,
				{ state: { responseTime = '' } = {} } = ctx || {},
				{ length = '' } = response || {};

			logLine = `${logLine} - ${responseTime && `${responseTime}ms `}${length && `${length}bytes`}${
				body
					? `\n  body: ${body
							.replace(/(\s{2,})/g, ' ')
							.replace(/\\n/g, '')
							.replace(/\\t+/g, ' ')}`
					: ''
			}`;
		}

		if (ctx && Object.keys(ctx).length) {
			logLine = `${logLine}\n  ctx: ${JSON.stringify(ctx)}`;
		}

		if (requestId) {
			logLine = `${logLine}\n  requestId: ${requestId}`;
		}

		additionalKeys.forEach(key => (logLine = `${logLine}\n  ${key}: ${typeof rest[key] === 'string' ? rest[key] : JSON.stringify(rest[key])}`));

		if (err) {
			const {
				code,
				context: { stack: contextStack = '', ...context } = {},
				stack
			} = err;

			logLine = `${logLine}\n  ${code ? `err.code: ${chalk.bold(code)}\n  ` : ''}${context ? `err.context: ${JSON.stringify(context)}\n  ` : ''}${
				contextStack ? `err.context.stack: ${contextStack}\n  ` : ''
			}${stack}`;
		}

		return `${prefix} ${colorLevel[level](logLine)}`;
	};

	return pretty({
		hideObject: true,
		ignore: 'pid,hostname,level,name,time',
		colorize: false,
		messageKey: 'message',
		messageFormat: defaultPrettifier
	});
};
