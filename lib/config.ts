/**
 * Main Configuration
 */

export const postgres = {
	host: process.env.POSTGRES_HOST,
	port: process.env.POSTGRES_PORT,
	username: process.env.POSTGRES_USERNAME,
	password: process.env.POSTGRES_PASSWORD,
	database: process.env.POSTGRES_DATABASE
}

if(
	!process.env.JWT_SECRET ||
	!process.env.JWT_ORDER_SECRET ||
	!process.env.JWT_TICKET_SECRET
) throw new Error('JWT config is not set');
export const jwt = {
	secret: process.env.JWT_SECRET,
	orderSecret: process.env.JWT_ORDER_SECRET,
	ticketSecret: process.env.JWT_TICKET_SECRET
}

export const google = {
	identityClientId: process.env.GOOGLE_IDENTITY_CLIENT_ID
}

export const mailgun = {
	domain: process.env.MAILGUN_DOMAIN,
	apiKey: process.env.MAILGUN_API_KEY
}

export const mailchimp = {
	domain: process.env.MAILCHIMP_DOMAIN,
	apiKey: process.env.MAILCHIMP_API_KEY
}

export const braintree = {
	environment: process.env.BRAINTREE_ENV || 'Sandbox',
	merchantId: process.env.BRAINTREE_MERCHANT_ID,
	publicKey: process.env.BRAINTREE_PUBLIC_KEY,
	privateKey: process.env.BRAINTREE_PRIVATE_KEY,
	serviceFee: 0
}
