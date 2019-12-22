/**
 * Main Configuration
 * @type {Object}
 */
module.exports = {
	db: {
		host: process.env.DB_HOST || 'rethinkdb',
		port: process.env.DB_PORT || 28015,
		name: 'mustachebash'
	},
	jwt: {
		secret: process.env.JWT_SECRET,
		transactionSecret: process.env.JWT_TRANSACTION_SECRET,
		ticketSecret: process.env.JWT_TICKET_SECRET
	},
	mailgun: {
		domain: process.env.MAILGUN_DOMAIN,
		apiKey: process.env.MAILGUN_API_KEY
	},
	mailchimp: {
		domain: process.env.MAILCHIMP_DOMAIN,
		apiKey: process.env.MAILCHIMP_API_KEY
	},
	donationProductId: process.env.DONATION_ID,
	braintree: {
		environment: process.env.BRAINTREE_ENV || 'Sandbox',
		merchantId: process.env.BRAINTREE_MERCHANT_ID,
		publicKey: process.env.BRAINTREE_PUBLIC_KEY,
		privateKey: process.env.BRAINTREE_PRIVATE_KEY,
		serviceFee: 3
	}
};
