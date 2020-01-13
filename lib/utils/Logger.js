/**
* Logger
*
* Class for creating a Bunyan logger
*/

const path = require('path'),
	Bunyan = require('bunyan'),
	bunyanDebugStream = require('bunyan-debug-stream'),
	responseTime = require('response-time'),
	uuid = require('uuid');


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

class Logger extends Bunyan {
	constructor({
		logStream = 'debug',
		logName = 'Mustache Bash Logger',
		logLevel = logStream === 'debug' ? 'debug' : 'info',
		...defaultProps
	} = {}) {
		// Add streams based on config
		const consoleDebugStream = {
				level: logLevel,
				type: 'raw',
				stream: bunyanDebugStream({
					basepath: __dirname,
					stringifiers: {
						req: ({ method, url, body }, { entry }) => {
							const { res } = entry;

							if(res.status < 400) return null;

							return {
								value: `${method} ${url} ${body ? JSON.stringify(body) : ''}`,
								consumed: ['req']
							};
						},
						res: ({ status, responseTime, length }) => ({
							value: `${status} ${responseTime || 0} ms - ${length || 0} bytes`,
							consumed: ['res']
						}),
						err: ({ braintreeResponse, stack, code, name }) => ({
							value: `[${code || 'UNKNOWN'}] - ${name}\n${braintreeResponse ? JSON.stringify(braintreeResponse, null, 2)+'\n' : ''}${stack}`
						})
					}
				})
			},
			consoleJsonStream = {
				level: logLevel,
				stream: process.stdout
			},
			fileJsonStream = {
				type: 'rotating-file',
				path: path.resolve(__dirname, '..', '..', 'logs/api.log'),
				period: '1d',
				count: 7
			},
			logStreams = [];

		if(logStream === 'debug') logStreams.push(consoleDebugStream);
		if(logStream === 'json') {
			logStreams.push(consoleJsonStream);
			logStreams.push(fileJsonStream);
		}

		super({
			name: logName,
			streams: logStreams,
			serializers: {
				req: reqSerializer,
				res: resSerializer,
				err: errSerializer
			},
			...defaultProps
		});

		this.logStream = logStream;
	}

	/**
	 * Overwrite the child prototype
	 */
	child(options = {}, simple) {
		return new Bunyan(this, options, simple);
	}

	/**
	 * Returns an array of middleware pertaining to the logger
	 */
	middleware() {
		return [
			(req, res, next) => {
				req.log = this.child({req_id: uuid.v4()});

				next();
			},
			responseTime((req, res, time) => {
				res.responseTime = time;
			})
		];
	}
}

module.exports = Logger;
