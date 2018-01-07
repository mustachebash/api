const express = require('express'),
	Logger = require('./utils/Logger'),
	router = require('./routes/'),
	socketService = require('./services/socket');

// Create the express instance
const app = express();

// App setup
app.disable('x-powered-by');
app.set('trust proxy');

// Log setup
const log = new Logger({
	logStream: process.env.LOG_STREAM,
	apiVersion: process.env.npm_package_version
});
app.set('log', log);

// Global Middleware
app.use(express.json());

// Child logger per request
app.use(log.middleware());

// Log every request after response is sent
app.use((req, res, next) => {
	res.on('finish', () => {
		let msg = `${req.method} ${req.originalUrl} ${res.statusCode}`;
		const ctx = {
			res,
			req
		};

		if(req.err) {
			ctx.err = req.err;
			msg = req.err.message;
		}

		if(res.statusCode >= 200 && res.statusCode < 400){
			req.log.info(ctx, msg);
		} else if(res.statusCode < 500) {
			req.log.warn(ctx, msg);
		} else if(res.statusCode >= 500) {
			req.log.error(ctx, msg);
		}
	});

	next();
});

// Routes
app.use('/v1', (req, res, next) => {
	res.header('Api-Version', process.env.npm_package_version);
	next();
}, router);

// 404
app.use((req, res) => {
	res.sendStatus(404);
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
	let statusCode;
	if(typeof err === 'number') {
		// Don't allow bad http statuses
		statusCode = err >= 400 && err < 600 ? err : 500;
	} else {
		// Set the err property for logging
		req.err = err;
		statusCode = err.statusCode || 500;
	}

	// Send a sanitized error back to the client via JSON
	res.sendStatus(statusCode);
});

const server = app.listen(4000, () => log.info(`Mustache Bash API ${process.env.npm_package_version} listening on port 4000`));

// Attach the socket server to the web server
socketService.init(server, app.get('log'));
