/**
 * Paul Revere schemas shared between client and server
 */

// Follow schema rules found at https://github.com/phretaddin/schemapack

exports.guest = {
	payload: {
		checked_in: 'bool',
		first_name: 'string',
		id: 'string',
		last_name: 'string',
		timestamp: 'float64',
		transaction_id: 'string'
	},
	meta: {
		timestamp: 'float64'
	}
};
