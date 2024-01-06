/**
 * WebSocket service
 */

const url = require('url'),
	PaulRevere =  require('paul-revere'),
	{ validateAccessToken } = require('./auth'),
	{ updateGuest } = require('./guests'),
	schemas = require('../utils/schemas');

const socket = {
	init(server, log) {
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

		// TODO: listen to event emitter when guest is checked in
		// listener.on('guest:create', () => {
		// 	guest.broadcast({
		// 		payload: {
		// 			...change.new_val,
		// 			checkedIn: change.new_val.checkedIn ? change.new_val.checkedIn.toISOString() : '', // Makes schemapack happy for 'false' values
		// 			updated: change.new_val.updated.toISOString(),
		// 			created: change.new_val.created.toISOString()
		// 		},
		// 		meta: {
		// 			timestamp: Date.now()
		// 		}
		// 	});
		// });
	}
};

module.exports = socket;
