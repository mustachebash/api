/**
 * WebSocket service
 */

const url = require('url'),
	r = require('rethinkdb'),
	PaulRevere =  require('paul-revere'),
	{ validateAccessToken } = require('./auth'),
	{ updateGuest } = require('./guests'),
	config = require('../config'),
	schemas = require('../utils/schemas');

const socket = {
	async init(server, log) {
		const paul = new PaulRevere(schemas, {server}),
			{ guest } = paul;

		this.guest = guest;

		paul.onConnection(c => {
			log.info(`Client connecting: ${c.__uuid}`);

			const accessToken = url.parse(c.upgradeReq.url, true).query.accessToken;

			// Require authentication
			try {
				const decoded = validateAccessToken(accessToken);

				log.info(`Client connected: ${c.__uuid} - ${decoded.sub}`);

				c.guest.onMessage(async (message) => {
					const { id, checkedIn, firstName, lastName} = message.payload;

					try {
						await updateGuest(id, {checkedIn, firstName, lastName});
					} catch (e) {
						log.error(e);
					}
				});

				c.onClose(() => {
					log.info(`Client disconnected: ${c.__uuid} - ${decoded.sub}`);
				});
			} catch(e) {
				log.error(`WebSocket Auth Failed: ${e.message}`);
				log.info(`Client closed: ${c.__uuid}`);
				return c.close();
			}
		});

		// RethinkDB streaming API for listening to new/updated guests
		try {
			const conn = await r.connect({
				host: config.db.host,
				db: config.db.name
			});

			await r.table('guests').wait().run(conn);

			const cursor = await r.table('guests').changes({includeTypes: true}).run(conn);

			cursor.each((err, change) => {
				if(!err && change.type !== 'remove') {
					guest.broadcast({
						payload: {
							...change.new_val,
							checkedIn: change.new_val.checkedIn ? change.new_val.checkedIn.toISOString() : '', // Makes schemapack happy for 'false' values
							updated: change.new_val.updated.toISOString(),
							created: change.new_val.created.toISOString()
						},
						meta: {
							timestamp: Date.now()
						}
					});
				}
			});
		} catch (e) {
			log.error(e);
		}
	}
};

module.exports = socket;
