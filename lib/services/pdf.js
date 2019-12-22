/**
 * PDF service for generating downloadable tickets
 * @type {Object}
 */

const PDFDocument = require('pdfkit');

module.exports = {
	generateTicketsPDF(guestsTicketsPairs) {
		const doc = new PDFDocument({margin: 50, autoFirstPage: false});

		guestsTicketsPairs.forEach(({ guest, ticket }) => {
			doc.addPage();

			const { firstName, lastName } = guest,
				{ qrCode } = ticket;

			doc.fontSize(20)
				.text('Mustache Bash 2020 - Ticket', 0, 57, {align: 'center'})
				.fontSize(14)
				.text(`for ${firstName} ${lastName}`, 0, 97, {align: 'center'})
				.image(qrCode, 0, 200);
		});

		return doc;
	}
};
