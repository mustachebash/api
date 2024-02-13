/**
 * Orders service handles all order operations and Braintree
 * @type {object}
 */
import braintree from 'braintree';
import jwt from 'jsonwebtoken';
import { v4 as uuidV4 } from 'uuid';
import log from '../utils/log.js';
import { sql } from '../utils/db.js';
import { createGuest } from '../services/guests.js';
import { braintree as btConfig, jwt as jwtConfig } from '../config.js';

const { orderSecret } = jwtConfig;

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

export async function getOrders({ eventId, productId, status, limit, orderBy = 'created', sort = 'desc' }) {
	try {
		let orders;
		if(eventId) {
			orders = await sql`
				WITH FilteredOrders AS (
					SELECT o.id
					FROM orders as o
					LEFT JOIN order_items as i
						ON o.id = i.order_id
					LEFT JOIN products as p
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
					LEFT JOIN order_items as i
						ON o.id = i.order_id
					WHERE i.product_id = ${productId}
					GROUP BY o.id
				)
				SELECT
					${sql(orderColumns.map(c => `o.${c}`))},
					${aggregateOrderItems}
				FROM orders as o
				LEFT JOIN order_items as i
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
}

export async function createOrder({ paymentMethodNonce, cart = [], customer = {}, promoId }) {
	// First do some validation
	if (!cart.length || !paymentMethodNonce || !customer.firstName || !customer.lastName || !customer.email) throw new OrdersServiceError('Invalid payment parameters', 'INVALID');

	const products = (await sql`
		SELECT p.*, COALESCE(SUM(oi.quantity), 0) as total_sold
		FROM products as p
		LEFT JOIN order_items as oi
			ON p.id = oi.product_id
		WHERE p.id in ${sql(cart.map(i => i.productId))}
		AND status = 'active'
		GROUP BY 1
	`).map(p => ({
		...p,
		...(typeof p.price === 'string' ? {price: Number(p.price)} : {}),
		...(typeof p.totalSold === 'string' ? {totalSold: Number(p.totalSold)} : {})
	}));

	let promo;
	if(promoId) {
		[promo] = (await sql`
			SELECT *
			FROM promos
			WHERE id = ${promoId}
		`).map(p => ({
			...p,
			...(typeof p.price === 'string' ? {price: Number(p.price)} : {}),
			...(typeof p.percentDiscount === 'string' ? {percentDiscount: Number(p.percentDiscount)} : {}),
			...(typeof p.flatDiscount === 'string' ? {flatDiscount: Number(p.flatDiscount)} : {})
		}));

		if(!promo || promo.status !== 'active') throw new OrdersServiceError('Invalid promo code', 'INVALID');
	}

	// Ensure we have the all the products attempting to be purchased
	// For now, use a slug of `GONE` since this should only occur when a product has become inactive since page load
	// if(!products.length || products.length !== cart.length) throw new OrdersServiceError('Empty/Invalid items in cart', 'INVALID');
	if(!products.length || products.length !== cart.length) throw new OrdersServiceError('Unavailable items in cart', 'GONE');

	const productsToArchive = [];
	const orderDetails = cart.map(i => {
		const product = products.find(p => p.id === i.productId),
			remaining = typeof product.maxQuantity === 'number' && product.maxQuantity > 0 ? product.maxQuantity - product.totalSold : null;

		// Special promo quantity check
		if(
			promo &&
			promo.productId === i.productId &&
			promo.type === 'single-use' &&
			promo.productQuantity < i.quantity
		) throw new OrdersServiceError('Promo quantity exceeded', 'INVALID');

		if(remaining !== null) {
			// So long as the product was active at start, don't worry if this individual order goes over the max
			// This minimizes the amount of customers who are buying and get failed orders
			// if(remaining < i.quantity) throw new OrdersServiceError('Purchase exceeds remaining quantity', 'INVALID');

			const totalSold = product.totalSold + i.quantity;

			if(totalSold >= product.maxQuantity) {
				productsToArchive.push({
					id: product.id,
					eventId: product.eventId,
					nextTierProductId: product.meta.nextTierProductId ?? null
				});
			}
		}

		return {
			...i,
			product
		};
	});

	// Do some janky non-transactional tier rolling for now
	try {
		for(const pta of productsToArchive) {
			await sql`
				UPDATE products
				SET status = 'archived', updated = now()
				WHERE id = ${pta.id}
			`;

			if(pta.nextTierProductId) {
				await sql`
					UPDATE products
					SET status = 'active', updated = now()
					WHERE id = ${pta.nextTierProductId}
				`;

				await sql`
					UPDATE events
					SET meta = jsonb_set(meta, '{currentTicket}', ${pta.nextTierProductId})
					WHERE id = ${pta.eventId}
				`;
			}
		}
	} catch(e) {
		log.error(e, 'Failed to archive sold out products');
	}

	const productSubtotal = orderDetails.map(i => {
		// Default to product price
		let itemPrice = i.product.price;

		// Overwrite/adjust amount if there's a promo that matches
		// single-use quantity checks are done in the initial order mapping
		if(promo && promo.productId === i.product.id) {
			// If we've set a price, that price always applies to each product regardless of quantity
			if(promo.price) {
				itemPrice = (promo.price);
			}

			// If there's a percent discount
			if(promo.percentDiscount && promo.type === 'coupon') {
				itemPrice = i.product.price - (i.product.price * (promo.percentDiscount / 100));
				// Round to 2 decimal places
				itemPrice = Math.round(amount * 100) / 100;
			}
		}

		return Number(i.quantity) * itemPrice;
	}).reduce((tot, cur) => tot + cur, 0);

	// We don't sell things for free - if this is 0, there's a bad purchase attempt
	if(productSubtotal === 0) throw new OrdersServiceError('Empty/Invalid items in cart', 'INVALID');

	// This probably doesn't need a remapping anymore?
	// Leaving because this is explicit about mapping the subtotal to the total charged
	const amount = productSubtotal;

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
	try {
		await sql`
			INSERT INTO orders ${sql(order)}
		`;
		await sql`
			INSERT INTO order_items ${sql(orderItems)}
		`;
		await sql`
			INSERT INTO transactions ${sql(transaction)}
		`;
	} catch(e) {
		// Don't let this write fail the response - the customer has been charged at this point
		log.error(e, 'Error writing order/order items/transactions to DB');
	}

	// Write a guest with the purchaser's name to the DB
	orderDetails.forEach(i => {
		if(i.product.type === 'ticket') {
			for (let j = 0; j < i.quantity; j++) {
				(async () => {
					try {
						await createGuest({
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
}

export async function generateOrderToken(id) {
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
}

export function validateOrderToken(token) {
	return jwt.verify(token, orderSecret, {issuer: 'mustachebash'});
}

export async function getOrder(id) {
	let order;
	try {
		[order] = (await sql`
			SELECT
				${sql(orderColumns.map(c => `o.${c}`))},
				${aggregateOrderItems}
			FROM orders as o
			LEFT JOIN order_items as i
				ON o.id = i.order_id
			WHERE id = ${id}
			GROUP BY o.id
		`).map(convertAmountToNumber);
	} catch(e) {
		throw new OrdersServiceError('Could not query orders', 'UNKNOWN', e);
	}

	if (!order) throw new OrdersServiceError('Order not found', 'NOT_FOUND');

	return order;
}

export async function getOrderTransfers(id) {
	let transfers;
	try {
		transfers = (await sql`
			SELECT
				${sql(orderColumns.map(c => `o.${c}`))}
			FROM orders as o
			WHERE o.parent_order_id = ${id}
			GROUP BY o.id
		`).map(convertAmountToNumber);
	} catch(e) {
		throw new OrdersServiceError('Could not query orders', 'UNKNOWN', e);
	}

	return transfers;
}

// Full order refund
export async function refundOrder(id) {
	let order;
	try {
		[order] = await sql`
			SELECT
				o.status AS order_status,
				t.id AS transaction_id,
				t.type AS transaction_type,
				t.processor_transaction_id,
				processor,
				t.parent_transaction_id
			FROM orders AS o
			LEFT JOIN transactions AS t
				ON o.id = t.order_id
			WHERE
				o.id = ${id};
		`;
	} catch(e) {
		throw new OrdersServiceError('Could not query orders', 'UNKNOWN', e);
	}

	if (!order) throw new OrdersServiceError('Order not found', 'NOT_FOUND');
	if (order.orderStatus !== 'complete') throw new OrdersServiceError(`Cannot refund order with status: ${order.orderStatus}`, 'REFUND_NOT_ALLOWED');

	const newTransaction = {
		id: uuidV4(),
		orderId: id,
		processor: order.processor,
		parentTransactionId: order.transactionId
	};

	if(order.processor === 'braintree') {
		let processorResponse;
		try {
			const {status: processorStatus} = await gateway.transaction.find(order.processorTransactionId);

			if(['settled', 'settling'].includes(processorStatus)) {
				processorResponse = await gateway.transaction.refund(order.processorTransactionId);
				newTransaction.type = 'refund';
			} else {
				processorResponse = await gateway.transaction.void(order.processorTransactionId);
				newTransaction.type = 'void';
			}
		} catch(e) {
			throw new OrdersServiceError('Order not refunded', 'BRAINTREE_ERROR', e);
		}

		// Sometimes the call is successful but the refund is not
		if(!processorResponse.success) throw new OrdersServiceError('Order not refunded', 'BRAINTREE_ERROR', processorResponse);

		newTransaction.processorTransactionId = processorResponse.transaction.id;
		newTransaction.processorCreatedAt = processorResponse.transaction.createdAt;
		newTransaction.amount = Number(processorResponse.transaction.amount);
	} else {
		throw new OrdersServiceError('Order not refunded', 'INVALID_PROCESSOR');
	}

	// Mark the order as canceled in our system, archive the guests
	try {
		await Promise.all([
			sql`
				INSERT INTO transactions ${sql(newTransaction)}
			`,
			sql`
				UPDATE orders
				SET status = 'canceled'
				WHERE id = ${id}
			`,
			sql`
				UPDATE guests
				SET status = 'archived', updated = now()
				WHERE order_id = ${id}
			`
		]);
	} catch(e) {
		throw new OrdersServiceError('Order voiding failed', 'UNKNOWN', e);
	}
}
