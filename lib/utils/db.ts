/**
* Database Utility
*
* @exports a singleton that exposes an encapsulated sql function
*/
import postgres from 'postgres';
import { postgres as pgConfig } from '../config.js';

export const sql = postgres({
	host: pgConfig.host,
	port: pgConfig.port,
	username: pgConfig.username,
	password: pgConfig.password,
	database: pgConfig.database,
	debug: process.env.NODE_ENV === 'development',
	ssl: 'prefer',
	transform: postgres.camel
});
