/**
 * PDF service for generating downloadable tickets
 * @type {Object}
 */

const path = require('path'),
	PDFDocument = require('pdfkit');

module.exports = {
	generateTicketsPDF(guestsTicketsPairs) {
		const doc = new PDFDocument({
			margins: {top: 20, left: 20, right: 20, bottom: 5},
			autoFirstPage: false,
			size: [280, 400],
			info: {
				Title: 'Mustache Bash 2020 Tickets',
				Author: 'Mustache Bash'
			}
		});

		guestsTicketsPairs.forEach(({ guest, ticket }) => {
			doc.addPage();

			const { firstName, lastName, confirmationId } = guest,
				{ qrCode, id } = ticket;

			doc.image(path.resolve(__dirname, '../../ticket-logo.png'), 68, 20, {width: 144})
				.font('Helvetica')
				.fontSize(18)
				.moveDown(1)
				.text('March 28th, 2020', {align: 'center'})
				.moveDown(1)
				.fontSize(12)
				.text(`${firstName} ${lastName}`, {align: 'center'})
				.fontSize(8)
				.text(`confirmation #: ${confirmationId}`, {align: 'center'})
				.image(qrCode, 40, 180, {width: 200})
				.fontSize(8)
				.font('Courier')
				.text(id.slice(0, 8), 20, 380, {align: 'center'});
		});

		return doc;
	}
};
