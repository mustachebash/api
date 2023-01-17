/**
 * PDF service for generating downloadable tickets
 * @type {Object}
 */

const path = require('path'),
	PDFDocument = require('pdfkit');

module.exports = {
	generateTicketsPDF(guestsTicketsPairs) {
		const doc = new PDFDocument({
			margins: {top: 36, left: 36, right: 36, bottom: 72},
			autoFirstPage: false,
			info: {
				Title: 'Mustache Bash 2023 Tickets',
				Author: 'Mustache Bash'
			}
		});

		guestsTicketsPairs.forEach(({ guest, ticket }) => {
			doc.addPage();

			const { firstName, lastName, confirmationId, vip } = guest,
				{ qrCode, id, name: eventName } = ticket;

			doc.image(path.resolve(__dirname, '../../ticket-logo.png'), {width: 144})
				.font('Helvetica')
				.fontSize(18)
				.moveDown(.5);

			// Hacky, but working for now
			if(/afterparty/i.test(eventName)) {
				doc.text('AFTERPARTY');
			}

			doc.text('March 25th, 2023')
				.fontSize(12)
				// Hacky, but working for now
				.text(/afterparty/i.test(eventName) ? 'Doors at 10:00pm' : 'Doors at 2:00pm')
				.fontSize(12)
				.text(`${firstName} ${lastName}${vip ? ' - **VIP**' : ''}`, 210, 56)
				.fontSize(8)
				.text(`confirmation: #${confirmationId}`)
				.moveDown(3.5)
				.fontSize(8)
				.text('21+ Only - Valid ID Required for Entry. NO RE-ENTRY')
				.moveDown(.5)
				.text('1000 N Harbor Dr, San Diego, CA 92101')
				.image(qrCode, 426, 25, {width: 150})
				.fontSize(8)
				.font('Courier')
				.text(id.slice(0, 8), 426, 176, {align: 'center'});

			doc.font('Helvetica')
				.fontSize(8)
				.text('mustachebash.com - @themustachebash - #themustachebash', 36, 190, {align: 'center'});

			doc.moveTo(20, 210)
				.lineTo(592, 210)
				.dash(5, {space: 10})
				.stroke();

			doc.font('Helvetica')
				.fontSize(18)
				.text('FREQUENTLY ASKED QUESTIONS', 36, 236)
				.moveDown(1)

				.fontSize(12)
				.text('How dressed up should I get?')
				.fontSize(8)
				.moveDown(.75)
				.text(`It's tradition to go all out! Don’t be the only goof without a '70s get-up. A complimentary coatcheck is available, so get weird with your best digs!`, {width: 200})
				.moveDown(2)

				.fontSize(12)
				.text('Do I have to have a mustache to go?')
				.fontSize(8)
				.moveDown(.75)
				// eslint-disable-next-line max-len
				.text(`Mustaches are highly encouraged, and you may get some flack if you show up without one. That said, we understand that sometimes circumstances do not permit man fuzz, and won't turn you away. A Basher is family, 'stache or not.`, {width: 200})
				.moveDown(2)

				.fontSize(12)
				.text('How should I get there and back?')
				.fontSize(8)
				.moveDown(.75)
				.text(`You're responsible for getting yourself safely to and from The Bash. Hop on a bus, trolley, or your preferred car service. Please don't drink and drive.`, {width: 200})
				.moveDown(2)

				.fontSize(12)
				.text('Will there be food and beverage?')
				.fontSize(8)
				.moveDown(.75)
				// eslint-disable-next-line max-len
				.text('There will be food trucks with a variety of quality cuisine available on site to fill your bellies throughout the day and night, and the Stache Bash Bar will be fully stocked all day. Food and beverages will be payable by mobile wallet, card, or cash. Mobile wallet and card are preferred, and fastest.', {width: 200});
		});

		return doc;
	}
};
