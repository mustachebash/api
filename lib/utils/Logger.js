/**
* Logger
*
* Class for creating a Pino logger
*/

const pino = require('pino'),
	responseTime = require('response-time');


// Custom serialize for the request object
function reqSerializer(req) {
	if (!req) return req;

	const reqObj =  {
		method: req.method,
		userAgent: req.get('User-Agent'),
		url: req.originalUrl,
		headers: req.headers,
		remoteAddress: req.ip
	};

	if(req.body) {
		reqObj.body = {...req.body}; // Shallow copy
		delete reqObj.body.password; // Don't log passwords
	}

	return reqObj;
}

function resSerializer(res) {
	if(!res) return res;

	return {
		length: res.get('Content-Length'),
		status: res.statusCode,
		responseTime: res.responseTime
	};
}

// Simply return the err
function errSerializer(err) {
	return err;
}

const defaultPrettifier = ({ messageKey } = {messageKey: 'msg'}) => {
	const chalk = require('chalk'),
		colorLevel = {
			[pino.levels.values.trace]: chalk.gray,
			[pino.levels.values.debug]: chalk.blue,
			[pino.levels.values.info]: chalk.green,
			[pino.levels.values.warn]: chalk.yellow,
			[pino.levels.values.error]: chalk.red,
			[pino.levels.values.fatal]: chalk.magenta
		};

	return data => {
		const { req, res, err, requestId, level, time, name, ...rest } = data,
			prefix = `${(new Date(time)).toISOString()} ${name}:`,
			levelLabel = chalk.bold(`[${pino.levels.labels[level].toUpperCase()}]`),
			ignoredKeys = ['pid', messageKey, 'hostname'],
			additionalKeys = Object.keys(rest).filter(key => !ignoredKeys.includes(key));

		// messageKey is the configured key where the log `msg` lives (default)
		let logLine = `${levelLabel} ${data[messageKey]}`;

		if(req) {
			const { body } = req,
				{ responseTime = '', length = '' } = res || {};

			logLine = `${logLine} - ${responseTime && `${responseTime}ms `}${length && `${length}bytes`}${body && Object.keys(body).length ? `\n  body: ${JSON.stringify(body)}` : ''}`;
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

const logSymbol = Symbol('log');
class Logger {
	constructor({
		logStream = 'debug',
		logName = 'Mustache Bash Logger',
		logLevel = logStream === 'debug'
			? 'debug'
			: 'info',
		prettifier = defaultPrettifier,
		redact
	} = {}) {
		this[logSymbol] = pino({
			name: logName,
			level: logLevel,
			prettyPrint: logStream === 'debug',
			prettifier: logStream === 'debug' && prettifier,
			redact,
			serializers: {
				req: reqSerializer,
				res: resSerializer,
				err: errSerializer
			}
		});
	}

	// Map the log level methods
	trace(...args) {
		this[logSymbol].trace(...args);
	}

	debug(...args) {
		this[logSymbol].debug(...args);
	}

	info(...args) {
		this[logSymbol].info(...args);
	}

	warn(...args) {
		this[logSymbol].warn(...args);
	}

	error(...args) {
		this[logSymbol].error(...args);
	}

	fatal(...args) {
		this[logSymbol].fatal(...args);
	}

	/**
	 * Returns an array of middleware pertaining to the logger
	 */
	middleware() {
		return [
			(req, res, next) => {
				req.log = this[logSymbol].child({requestId: req.requestId});

				next();
			},
			responseTime((req, res, time) => {
				res.responseTime = time;
			})
		];
	}
}

module.exports = Logger;
