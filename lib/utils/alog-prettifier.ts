import { pino, LogDescriptor } from 'pino';

export default async () => {
	const pretty = (await import('pino-pretty')).default,
		chalk = (await import('chalk')).default;

	const colorLevel = {
		[pino.levels.values.trace]: chalk.gray,
		[pino.levels.values.debug]: chalk.blue,
		[pino.levels.values.info]: chalk.green,
		[pino.levels.values.warn]: chalk.yellow,
		[pino.levels.values.error]: chalk.red,
		[pino.levels.values.fatal]: chalk.magenta
	};

	const defaultPrettifier = (log: LogDescriptor, messageKey: string) => {
		const { level, request, response, ctx, err, requestId, time, name, ...rest } = log,
			prefix = `${new Date(time as number).toISOString()} ${name}:`,
			levelLabel = chalk.bold(`[${pino.levels.labels[level].toUpperCase()}]`),
			ignoredKeys = ['pid', messageKey, 'hostname'],
			additionalKeys = Object.keys(rest).filter(key => !ignoredKeys.includes(key));

		// messageKey is the configured key where the log `msg` lives (default)
		let logLine = `${levelLabel} ${log[messageKey]}`;

		if (request) {
			const { body } = request,
				{ responseTime = '', length = '' } = response || {};

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
			} = err as { code: string; context: Record<string, unknown> & { stack?: string }; stack: string };
			logLine = `${logLine}\n  ${code ? `err.code: ${chalk.bold(code)}\n  ` : ''}${context ? `err.context: ${JSON.stringify(context)}\n  ` : ''}${
				contextStack ? `err.context.stack: ${contextStack}\n` : ''
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
