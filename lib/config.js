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
		secret: process.env.JWT_SECRET
	},
	mailgun: {
		domain: process.env.MAILGUN_DOMAIN,
		apiKey: process.env.MAILGUN_API_KEY
	},
	braintree: {
		environment: process.env.BRAINTREE_ENV || 'Sandbox',
		merchantId: process.env.BRAINTREE_MERCHANT_ID,
		publicKey: process.env.BRAINTREE_PUBLIC_KEY,
		privateKey: process.env.BRAINTREE_PRIVATE_KEY
	}
};
