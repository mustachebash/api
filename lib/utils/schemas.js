/**
 * Paul Revere schemas shared between client and server
 */

// Follow schema rules found at https://github.com/phretaddin/schemapack

exports.guest = {
	payload: {
		checkedIn: 'bool',
		createdBy: 'string',
		firstName: 'string',
		id: 'string',
		lastName: 'string',
		created: 'string',
		updated: 'string',
		transactionId: 'string'
	},
	meta: {
		timestamp: 'float64'
	}
};
