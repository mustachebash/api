/**
 * Email service for sending transactional emails
 * @type {Object}
 */

const config = require('../config'),
	mailgun = require('mailgun-js')({apiKey: config.mailgun.apiKey, domain: config.mailgun.domain});

module.exports = {
	sendReceipt(guestFirstName, guestLastName, guestEmail, confirmation, amount, quantity) {
		let guestsText = ' on the list, so be sure to bring your ID ';
		if(quantity > 1) {
			guestsText = ' and your guests on the list, so be sure to bring your IDs ';
		}

		mailgun.messages().send({
			from: 'Mustache Bash Tickets <contact@mustachebash.com>',
			to: guestFirstName + ' ' + guestLastName + ' <' + guestEmail + '> ',
			subject: 'Mustache Bash 2018 - Your Ticket Order - Confirmation ' + confirmation,
			html: 'Hi ' + guestFirstName + '! Thanks so much for your ticket order. Details are below.' +
				'\n' +
				'\nConfirmation Number: ' + confirmation +
				'\nQuantity: ' + quantity +
				'\nTotal: $' + amount +
				'\n' +
				'\nWe\'re excited to have you at The Mustache Bash! Keep this confirmation email for your records. We have your name' + guestsText + 'to check in at willcall.' +
				'\n' +
				'\nIf you have any questions regarding your purchase, feel free to reply to this email. Thanks and see you at the Bash!' +
				'\n' +
				'\nSincerely,' +
				'\nTeam Mustache Bash'
		}).then(console.log).catch(console.error);
	}
};
