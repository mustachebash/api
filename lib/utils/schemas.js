/**
 * Paul Revere schemas shared between client and server
 */

// Follow schema rules found at https://github.com/phretaddin/schemapack

exports.guest = {
	payload: {
		checkedIn: 'string',
		createdBy: 'string',
		firstName: 'string',
		id: 'string',
		lastName: 'string',
		created: 'string',
		updated: 'string',
		transactionId: 'string',
		confirmationId: 'string',
		eventId: 'string',
		status: 'string'
	},
	meta: {
		timestamp: 'float64'
	}
};
