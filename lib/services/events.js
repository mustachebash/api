/**
 * Events Service
 * Handles all event actions
 * @type {Object}
 */
const { run, r } = require('../utils/db');

// class EventsServiceError extends Error {
// 	constructor(message = 'An unknown error occured', code = 'UNKNOWN') {
// 		super(message);
//
// 		this.name = this.constructor.name;
// 		this.code = code;
//
// 		Error.captureStackTrace(this, this.constructor);
// 	}
// }

module.exports = {
	getEvents() {
		return run(r.table('events').orderBy('date')).then(cursor => cursor.toArray());
	},

	getEvent(id) {
		return run(r.table('events').get(id));
	}
};
