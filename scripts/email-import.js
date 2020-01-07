const crypto = require('crypto'),
	r = require('rethinkdb'),
	MailChimpClient = require('mailchimp-api-v3'),
	[,, apiKey, listId] = process.argv;

const mailchimp = new MailChimpClient(apiKey),
	md5 = string => crypto.createHash('md5').update(string).digest('hex'),
	capitalize = string => string[0].toUpperCase() + string.slice(1).toLowerCase();

console.log(apiKey, listId);

async function importEmails() {
	let conn;
	try {
		conn = await r.connect({
			db: 'mustachebash'
		});

		const query = r.table('transactions')
			.hasFields('email')
			.filter(r.row('email').match('furfaro').not())
			.map(row => {
				return {
					email: row('email'),
					firstName: row('firstName'),
					lastName: row('lastName'),
					tags: row('order')
						.map(orderItem => r.table('products').get(orderItem('productId')))
						.filter({type: 'ticket'})
						.map(product => r.table('events').get(product('eventId'))('name').add(' Attendee'))
				};
			})
			.group('email')
			.ungroup()
			.map(row => ({
				email: row('group'),
				firstName: row('reduction')('firstName').nth(0),
				lastName: row('reduction')('lastName').nth(0),
				tags: row('reduction').concatMap(red => red('tags')).distinct()
			}))
			.filter(r.row('email').ne(''));

		const data = await (await query.run(conn)).toArray();

		const calls = data.flatMap(({ email, firstName, lastName, tags }) => {
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
						tags: tags.map(tag => ({name: tag, status: 'active'}))
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

importEmails();
