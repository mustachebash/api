/**
 * Email service for sending transactional emails
 * @type {Object}
 */

const config = require('../config'),
	mailgun = require('mailgun-js')({apiKey: config.mailgun.apiKey, domain: config.mailgun.domain});

module.exports = {
	sendReceipt(guestFirstName, guestLastName, guestEmail, confirmation, amount) {
		mailgun.messages().send({
			from: 'Mustache Bash Tickets <contact@mustachebash.com>',
			to: guestFirstName + ' ' + guestLastName + ' <' + guestEmail + '> ',
			subject: 'Mustache Bash 2018 - Your Ticket Order - Confirmation ' + confirmation,
			html: '<p>Hi ' + guestFirstName + '! Thanks so much for your ticket order. Details are below.<p>' +
				'<p>' +
					'Confirmation Number: ' + confirmation + '<br>' +
					'Total: $' + amount +
				'</p>' +
				'<p>We\'re excited to have you at The Mustache Bash! Keep this confirmation email for your records. We have your name on the list, so be sure to bring your ID to check in at willcall.</p>' +
				'<p>If you have any questions regarding your purchase, feel free to reply to this email. Thanks and see you at the Bash!</p>' +
				'<p>Sincerely,<br>' +
				'Team Mustache Bash</p>'
		}).then(console.log).catch(console.error);
	}
};
