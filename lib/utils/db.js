/**
* Database Utility
*
* @exports a singleton that exposes an encapsulated sql function
*/
const postgres = require('postgres'),
	config = require('../config');

module.exports = {
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
