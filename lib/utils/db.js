/**
* Database Utility
*
* @exports a singleton that exposes an encapsulated run function
*/
const r = require('rethinkdb'),
	postgres = require('postgres'),
	config = require('../config');

module.exports = {
	run: query => r.connect({
		host: config.db.host,
		port: config.db.port,
		db: config.db.name
	}).then(conn => query.run(conn).finally(() => conn.close())),
	r,
	sql: postgres({
		host: config.postgres.host,
		port: config.postgres.port,
		username: config.postgres.username,
		password: config.postgres.password,
		database: config.postgres.database,
		debug: process.env.NODE_ENV === 'development',
		ssl: 'prefer',
		transform: postgres.camel
	})
};
