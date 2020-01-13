/**
* Database Utility
*
* @exports a singleton that exposes an encapsulated run function
*/
const r = require('rethinkdb'),
	config = require('../config');

module.exports = {
	run: query => r.connect({
		host: config.db.host,
		port: config.db.port,
		db: config.db.name
	}).then(conn => query.run(conn).finally(() => conn.close())),
	r
};
