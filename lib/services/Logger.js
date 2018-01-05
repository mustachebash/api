/**
* Logger
*
* Class for creating a Bunyan logger
*/

const Bunyan = require('bunyan'),
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

							if(res.status < 500) return null;

							return {
								value: `${method} ${url} ${res.status} ${body ? JSON.stringify(body) : ''}`,
								consumed: ['req']
							};
						},
						res: ({ responseTime, length }) => ({
							value: `${responseTime || 0} ms - ${length || 0} bytes`,
							consumed: ['res']
						})
					}
				})
			},
			consoleJsonStream = {
				level: logLevel,
				stream: process.stdout
			},
			logStreams = [];

		if(logStream === 'debug') logStreams.push(consoleDebugStream);
		if(logStream === 'json') logStreams.push(consoleJsonStream);

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
