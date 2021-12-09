const crypto = require('crypto'),
	r = require('rethinkdb'),
	MailChimpClient = require('mailchimp-api-v3'),
	[,, apiKey, listId, eventId] = process.argv;

const mailchimp = new MailChimpClient(apiKey),
	md5 = string => crypto.createHash('md5').update(string).digest('hex'),
	capitalize = string => string[0].toUpperCase() + string.slice(1).toLowerCase();

console.log(apiKey, listId);

async function tagRefundedEmails() {
	let conn;
	try {
		conn = await r.connect({
			db: 'mustachebash'
		});

		const query = r.table('transactions')
			.hasFields('email')
			.filter({status: 'refunded'})
			.filter(r.row('email').match('furfaro').not())
			.filter(r.row('email').match('oreilly.dustin').not())
			.filter(
				r.row('order')
					.map(orderItem => r.table('products').get(orderItem('productId')))
					.filter({type: 'ticket', eventId}).count().gt(0)
			)
			.map(row => {
				return {
					email: row('email'),
					firstName: row('firstName'),
					lastName: row('lastName'),
					tag: r.table('events').get(eventId)('name').add(' Refunded')
				};
			})
			.group('email')
			.ungroup()
			.map(row => ({
				email: row('group'),
				firstName: row('reduction')('firstName').nth(0),
				lastName: row('reduction')('lastName').nth(0),
				tag: row('reduction')('tag').nth(0)
			}))
			.filter(r.row('email').ne(''));

		const data = await (await query.run(conn)).toArray();

		const calls = data.flatMap(({ email, firstName, lastName, tag }) => {
			const memberHash = md5(email.toLowerCase());

			return [
				{
					method: 'put',
					path: `/lists/${listId}/members/${memberHash}`,
					body: {
						email_address: email,
						status_if_new: 'subscribed',
						merge_fields: {
							FNAME: capitalize(firstName.trim()),
							LNAME: capitalize(lastName.trim())
						}
					}
				},
				{
					method: 'post',
					path: `/lists/${listId}/members/${memberHash}/tags`,
					body: {
						tags: [{name: tag, status: 'active'}]
					}
				}
			];
		});

		const batchResponse = await mailchimp.batch(calls);

		console.dir(batchResponse);
	} catch(e) {
		console.error(e);
	} finally {
		if(conn) conn.close();
	}
}

tagRefundedEmails();
