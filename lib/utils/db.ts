/**
* Database Utility
*
* @exports a singleton that exposes an encapsulated sql function
*/
import postgres from 'postgres';
import config from '../config.js';

export const sql = postgres({
	host: config.postgres.host,
	port: config.postgres.port,
	username: config.postgres.username,
	password: config.postgres.password,
	database: config.postgres.database,
	debug: process.env.NODE_ENV === 'development',
	ssl: 'prefer',
	transform: postgres.camel
});
