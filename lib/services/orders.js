/**
 * Orders service handles all order operations and Braintree
 * @type {object}
 */
const braintree = require('braintree'),
	jwt = require('jsonwebtoken'),
	{ v4: uuidV4 } = require('uuid'),
	log = require('../utils/log'),
	{ run, r, sql } = require('../utils/db'),
	{ createGuest } = require('../services/guests'),
	{ braintree: btConfig, jwt: { orderSecret } } = require('../config');

const gateway = new braintree.BraintreeGateway({
	environment: braintree.Environment[btConfig.environment],
	merchantId: btConfig.merchantId,
	publicKey: btConfig.publicKey,
	privateKey: btConfig.privateKey
});

class OrdersServiceError extends Error {
	constructor(message = 'An unknown error occured', code = 'UNKNOWN', context) {
		super(message);

		this.name = this.constructor.name;
		this.code = code;
		this.context = context;

		Error.captureStackTrace(this, this.constructor);
	}
}

const orderColumns = [
	'id',
	'amount',
	'created',
	'customer_id',
	'promo_id',
	'parent_order_id',
	'status',
	'meta'
];

const aggregateOrderItems = sql`
	ARRAY_AGG(
		JSON_BUILD_OBJECT(
			'productId', i.product_id,
			'quantity', i.quantity
		)
	) as items
`;

const convertAmountToNumber = o => ({...o, ...(typeof o.amount === 'string' ? {amount: Number(o.amount)} : {})});

module.exports = {
	async getOrders({ eventId, productId, status, limit, orderBy = 'created', sort = 'desc' }) {
		try {
			let orders;
			if(eventId) {
				orders = await sql`
					WITH FilteredOrders AS (
						SELECT o.id
						FROM orders as o
						JOIN order_items as i
							ON o.id = i.order_id
						JOIN products as p
							ON i.product_id = p.id
						WHERE p.event_id = ${eventId}
						GROUP BY o.id
					)
					SELECT
						${sql(orderColumns.map(c => `o.${c}`))},
						c.email as customer_email,
						c.first_name as customer_first_name,
						c.last_name as customer_last_name,
						${aggregateOrderItems}
					FROM orders as o
					LEFT JOIN order_items as i
						ON o.id = i.order_id
					LEFT JOIN customers as c
						ON o.customer_id = c.id
					WHERE o.id IN (SELECT id FROM FilteredOrders)
					${status ? sql`AND o.status = ${status}` : sql``}
					GROUP BY o.id, customer_email, customer_first_name, customer_last_name
					ORDER BY ${sql(`o.${orderBy}`)} ${sort === 'desc' ? sql`desc` : sql`asc`}
					${(limit && Number(limit)) ? sql`LIMIT ${limit}` : sql``}
				`;
			} else if(productId) {
				orders = await sql`
					WITH FilteredOrders AS (
						SELECT o.id
						FROM orders as o
						JOIN order_items as i
							ON o.id = i.order_id
						WHERE i.product_id = ${productId}
						GROUP BY o.id
					)
					SELECT
						${sql(orderColumns.map(c => `o.${c}`))},
						${aggregateOrderItems}
					FROM orders as o
					JOIN order_items as i
						ON o.id = i.order_id
					WHERE o.id IN (SELECT id FROM FilteredOrders)
					${status ? sql`AND o.status = ${status}` : sql``}
					GROUP BY o.id
					ORDER BY ${sql(`o.${orderBy}`)} ${sort === 'desc' ? sql`desc` : sql`asc`}
					${(limit && Number(limit)) ? sql`LIMIT ${limit}` : sql``}
				`;
			} else {
				orders = await sql`
					SELECT
						${sql(orderColumns.map(c => `o.${c}`))},
						${aggregateOrderItems}
					FROM orders as o
					LEFT JOIN order_items as i
						ON o.id = i.order_id
					WHERE 1 = 1
					${status ? sql`AND o.status = ${status}` : sql``}
					GROUP BY o.id
					ORDER BY ${sql(`o.${orderBy}`)} ${sort === 'desc' ? sql`desc` : sql`asc`}
					${(limit && Number(limit)) ? sql`LIMIT ${limit}` : sql``}
				`;
			}

			// https://github.com/porsager/postgres#numbers-bigint-numeric
			return orders.map(convertAmountToNumber);
		} catch(e) {
			throw new OrdersServiceError('Could not query orders', 'UNKNOWN', e);
		}
	},

	async createOrder({ paymentMethodNonce, cart = [], customer = {}, promoId }) {
		// First do some validation
		if (!cart.length || !paymentMethodNonce || !customer.firstName || !customer.lastName || !customer.email) throw new OrdersServiceError('Invalid payment parameters', 'INVALID');

		// const products = await run(r.table('products').getAll(...cart.map(i => i.productId)).filter({status: 'active'})).then(cursor => cursor.toArray());
		const products = (await sql`
			SELECT *
			FROM products
			WHERE id in (${cart.map(i => i.productId)})
			AND status = 'active'
		`).map(p => ({
			...p,
			...(typeof p.price === 'string' ? {price: Number(p.price)} : {})
		}));

		let promo;
		if(promoId) {
			[promo] = (await sql`
				SELECT *
				FROM promos
				WHERE id = ${promoId}
			`).map(p => ({
				...p,
				...(typeof p.price === 'string' ? {price: Number(p.price)} : {})
			}));

			if(promo.status !== 'active') throw new OrdersServiceError('Invalid promo code', 'INVALID');
		}

		// Ensure we have the all the products attempting to be purchased
		if(!products.length || products.length !== cart.length) throw new OrdersServiceError('Empty/Invalid items in cart', 'INVALID');

		const orderDetails = cart.map(i => {
			// TODO: reimplement this with a live query for current totals
			// const product = products.find(p => p.id === i.productId),
			// 	remaining = typeof product.quantity === 'number' && product.quantity > 0 ? product.quantity - (product.sold || 0) : null;
			const product = products.find(p => p.id === i.productId);

			// if(remaining !== null) {
			// 	if(remaining < i.quantity) throw new OrdersServiceError('Purchase exceeds remaining quantity', 'INVALID');

			// 	const totalSold = (product.sold || 0) + i.quantity;
			// 	productsToUpdate.push({
			// 		id: product.id,
			// 		sold: totalSold,
			// 		// Mark as archived if this order sells the item out
			// 		status: totalSold >= product.quantity ? 'archived' : product.status
			// 	});
			// }

			return {
				...i,
				product
			};
		});

		const productSubtotal = orderDetails.map(i => Number(i.quantity) * i.product.price).reduce((tot, cur) => tot + cur, 0);

		// We don't sell things for free - if this is 0 and there's no promo, there's a bad purchase attempt
		if(productSubtotal === 0 && (!promo || !promo.price)) throw new OrdersServiceError('Empty/Invalid items in cart', 'INVALID');

		let amount = productSubtotal;

		// Overwrite amount if there's a promo and it sets a price
		// Include the service fee and any donation amount
		if(promo && promo.price && promo.quantity) {
			amount = (promo.price * promo.quantity);
		}

		// Find or insert a customer record immediately before attempting charge
		const normalizedEmail = customer.email.toLowerCase().trim();
		let dbCustomer;
		[dbCustomer] = await sql`
			SELECT *
			FROM customers
			WHERE email = ${normalizedEmail}
		`;

		if(!dbCustomer) {
			const newCustomer = {
				id: uuidV4(),
				firstName: customer.firstName.trim(),
				lastName: customer.lastName.trim(),
				email: normalizedEmail
			};

			[dbCustomer] = await sql`
				INSERT INTO customers ${sql(newCustomer)}
				RETURNING *
			`;
		}

		const orderId = uuidV4();
		const response = await gateway.transaction.sale({
			// Get the amount to charge based on the product passed in
			amount,
			paymentMethodNonce: paymentMethodNonce,
			// TODO: include the product ids and quantities
			customFields: {
				customer_id: dbCustomer.id,
				// Note that these use the raw user input values, and not what we have normalized in the DB
				primary_guest_name: `${customer.firstName} ${customer.lastName}`,
				primary_guest_email: customer.email,
				order_id: orderId,
				...promoId && {promo_id: promoId}
			},
			options: {
				submitForSettlement: true
			}
		});

		// Payment order errored - try again
		if(!response.success) {
			throw new OrdersServiceError(`Order error: "${response.message}"`, 'UNKNOWN', response);
		}

		const braintreeTransaction = response.transaction,
			btAmount = Number(braintreeTransaction.amount);

		// Package the order, order_item, and transaction objects
		const order = {
			id: orderId,
			customerId: dbCustomer.id,
			status: 'complete',
			amount
		};

		const orderItems = cart.map(i => ({
			productId: i.productId,
			quantity: i.quantity,
			orderId
		}));

		const transaction = {
			id: uuidV4(),
			amount: !Number.isNaN(btAmount) ? btAmount : null,
			processor: 'braintree',
			processorTransactionId: braintreeTransaction.id,
			processorCreatedAt: braintreeTransaction.createdAt,
			type: 'sale',
			orderId
		};

		// If a promo was used, mark it as claimed
		if(promoId && promo) {
			order.promoId = promoId;

			if(promo.type === 'single-use') {
				await sql`
					UPDATE promos
					SET status = 'claimed', updated = now()
					WHERE id = ${promoId}
				`;
			}
		}

		// Write the order to the DB (transaction needed?)
		await sql`
			INSERT INTO orders ${sql(order)}
		`;
		await sql`
			INSERT INTO order_items ${sql(orderItems)}
		`;
		await sql`
			INSERT INTO transactions ${sql(transaction)}
		`;

		// Write a guest with the purchaser's name to the DB
		orderDetails.forEach(i => {
			if(i.product.type === 'ticket') {
				for (let j = 0; j < i.quantity; j++) {
					(async () => {
						try {
							const { id: guestId } = await createGuest({
								firstName: dbCustomer.firstName,
								lastName: dbCustomer.lastName  + (j > 0 ? ` Guest ${j}` : ''),
								createdReason: 'purchase',
								eventId: i.product.eventId,
								orderId,
								admissionTier: i.product.admissionTier
							});
						} catch(e) {
							log.error(e, 'Error creating guest');
						}
					})();
				}
			}
		});

		return {
			order,
			transaction,
			customer: dbCustomer
		};
	},

	async generateOrderToken(id) {
		let order;
		try {
			[order] = (await sql`
				SELECT ${sql(orderColumns)}
				FROM orders
				WHERE id = ${id}
			`).map(convertAmountToNumber);
		} catch(e) {
			throw new OrdersServiceError('Could not query orders', 'UNKNOWN', e);
		}

		if(!order) throw new OrdersServiceError('Order not found', 'NOT_FOUND');

		return jwt.sign({
			iss: 'mustachebash',
			aud: 'tickets',
			iat: Math.round(order.created / 1000),
			sub: id
		},
		orderSecret);
	},

	validateOrderToken(token) {
		return jwt.verify(token, orderSecret, {issuer: 'mustachebash'});
	},

	async getOrder(id) {
		let order;
		try {
			[order] = (await sql`
				SELECT
					${sql(orderColumns.map(c => `o.${c}`))},
					${aggregateOrderItems}
				FROM orders as o
				JOIN order_items as i
					ON o.id = i.order_id
				WHERE id = ${id}
				GROUP BY o.id
			`).map(convertAmountToNumber);
		} catch(e) {
			throw new OrdersServiceError('Could not query orders', 'UNKNOWN', e);
		}

		if (!order) throw new OrdersServiceError('Order not found', 'NOT_FOUND');

		return order;
	},

	// Full refunds only
	async refundOrder(id, username) {
		const order = await run(r.table('orders').get(id));

		if(!order) throw new OrdersServiceError('Order not found', 'NOT_FOUND');

		let refundResponse, orderStatus;
		try {
			const {status: processorStatus} = await gateway.order.find(order.braintreeTransactionId);

			if(['settled', 'settling'].includes(processorStatus)) {
				orderStatus = 'refunded';
				refundResponse = await gateway.order.refund(order.braintreeTransactionId);
			} else {
				orderStatus = 'voided';
				refundResponse = await gateway.order.void(order.braintreeTransactionId);
			}
		} catch(e) {
			throw new OrdersServiceError('Order not refunded', 'BRAINTREE_ERROR', e);
		}

		// Sometimes the call is successful but the refund is not
		if(!refundResponse.success) throw new OrdersServiceError('Order not refunded', 'BRAINTREE_ERROR', refundResponse);

		// Mark the order as refunded in our system, disable the guests and tickets
		try {
			// Synchronize this
			const updated = r.now();
			await Promise.all([
				run(r.table('orders').get(id).update({status: orderStatus, updatedBy: username, updated})),
				run(r.table('guests').filter({orderId: order.id}).update({status: 'archived', updatedBy: username, updated})),
				run(r.table('tickets')
					.getAll(
						r.args(r.table('guests').filter({orderId: order.id})('id').coerceTo('array')),
						{index: 'guestId'}
					)
					.update({status: 'disabled', updatedBy: username, updated}))
			]);
		} catch(e) {
			console.error(e);
			throw new OrdersServiceError('Order voiding failed', 'UNKNOWN');
		}

		return refundResponse;
	},

	async transferOrderTickets(id, transferee, username) {
		const order = await run(r.table('orders').get(id)),
			guests = await run(r.table('guests').filter({orderId: id})).then(cursor => cursor.toArray());

		if(!order) throw new OrdersServiceError('Order not found', 'NOT_FOUND');

		// Create a new order for 0 dollars, create guests and tickets
		// Package the order object
		const transfereeOrder = {
			// Assume the first word is the first name, and anything else after is a last name. Sorry Billy Bob
			firstName: transferee.firstName,
			lastName: transferee.lastName,
			email: transferee.email,
			originalOrderId: order.id,
			type: 'transfer',
			amount: 0, // 0 dollar amount because no money was collected
			created: r.now(),
			order: [] // empty array because nothing was purchased
		};

		// Write the order to the DB
		const { changes } = await run(r.table('orders').insert(transfereeOrder, {returnChanges: true}));

		// Duplicate all original guests but with the transferee's name and id to the DB
		guests.forEach(async (guest, i) => {
			try {
				const { id: guestId } = await createGuest({
					firstName: transferee.firstName,
					lastName: transferee.lastName  + (i > 0 ? ` Guest ${i}` : ''),
					eventId: guest.eventId,
					orderId: changes[0].new_val.id,
					originalOrderId: order.id,
					confirmationId: order.id.substring(0, 8),
					createdBy: 'transfer'
				});

				await createGuestTicket(guestId);
			} catch(e) {
				log.error(e, 'Error creating guest or ticket');
			}
		});

		// Mark the order as transferred in our system, disable the guests and tickets
		try {
			// Synchronize this
			const updated = r.now();
			await Promise.all([
				run(r.table('orders').get(id).update({status: 'transferred', transfereeId: changes[0].new_val.id, updatedBy: username, updated})),
				run(r.table('guests').filter({orderId: order.id}).update({status: 'archived', updatedBy: username, updated})),
				run(r.table('tickets')
					.getAll(
						r.args(r.table('guests').filter({orderId: order.id})('id').coerceTo('array')),
						{index: 'guestId'}
					)
					.update({status: 'disabled', updatedBy: username, updated}))
			]);
		} catch(e) {
			console.error(e);
			throw new OrdersServiceError('Order voiding failed', 'UNKNOWN');
		}

		return changes[0].new_val;
	}
};
