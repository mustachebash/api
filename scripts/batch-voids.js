const r = require('rethinkdb'),
	braintree = require('braintree');

const gateway = new braintree.BraintreeGateway({
	environment: braintree.Environment[process.env.BRAINTREE_ENV || 'Sandbox'],
	merchantId: process.env.BRAINTREE_MERCHANT_ID,
	publicKey: process.env.BRAINTREE_PUBLIC_KEY,
	privateKey: process.env.BRAINTREE_PRIVATE_KEY
});

async function batchVoids() {
	let conn;
	try {
		conn = await r.connect({
			db: 'mustachebash'
		});

		const braintreeIds = [];
		await new Promise((resolve, reject) => {
			const searchStream = gateway.transaction.search(search => {
				search.status().is(braintree.Transaction.Status.Voided);
			});

			searchStream.on('data', transaction => {
				braintreeIds.push(transaction.id);
			});
			searchStream.on('error', reject);
			searchStream.on('end', () => {
				resolve();
			});
		});

		// Mark the transactions as voided in our system, disable the guests and tickets
		const updated = r.now(),
			transactionIds = await r.table('transactions').getAll(r.args(braintreeIds), {index: 'braintreeTransactionId'})('id').run(conn).then(cursor => cursor.toArray()),
			guestsQuery = r.table('guests').getAll(r.args(transactionIds), {index: 'transactionId'});

		await Promise.all([
			r.table('transactions').getAll(r.args(transactionIds)).update({status: 'voided', updatedBy: 'batch.void', updated}).run(conn),
			guestsQuery.update({status: 'archived', updatedBy: 'batch.void', updated}).run(conn),
			r.table('tickets')
				.getAll(
					r.args(guestsQuery('id').coerceTo('array')),
					{index: 'guestId'}
				)
				.update({status: 'disabled', updatedBy: 'batch.void', updated}).run(conn)
		]);

		console.log('Complete!');
	} catch(e) {
		console.error(e);
	} finally {
		if(conn) conn.close();
	}
}

batchVoids();
