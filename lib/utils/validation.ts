/**
 * Validation utilities for request body validation
 * Returns typed data on success, error messages on failure
 */
import { isRecordLike } from './type-guards.js';
import type { GuestInput } from '../services/guests.js';
import type { OrderInput } from '../services/orders.js';
import type { ProductType } from '../services/products.js';
import type { PromoInput, PromoType } from '../services/promos.js';

// ============================================================================
// Validation Result Types
// ============================================================================

export type ValidationResult<T> = { valid: true; data: T } | { valid: false; error: string };

// ============================================================================
// Primitive Type Guards
// ============================================================================

function isString(value: unknown): value is string {
	return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
	return typeof value === 'number' && !Number.isNaN(value);
}

function isBoolean(value: unknown): value is boolean {
	return typeof value === 'boolean';
}

function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

// ============================================================================
// Input Types for Routes (some differ slightly from service types)
// ============================================================================

// Guest input from route (createdBy and createdReason are added by route)
export type GuestCreateInput = Omit<GuestInput, 'createdBy' | 'createdReason'>;

// Guest update input (all fields optional)
export type GuestUpdateInput = {
	firstName?: string;
	lastName?: string;
	admissionTier?: string;
	status?: 'active' | 'checked_in';
	meta?: Record<string, unknown>;
};

// Event input types
export type EventCreateInput = {
	id?: string;
	name: string;
	date: string | Date;
	openingSales?: string | Date | null;
	salesEnabled?: boolean;
	maxCapacity?: number | null;
	budget?: number | null;
	alcoholRevenue?: number | null;
	foodRevenue?: number | null;
	meta?: Record<string, unknown>;
};

export type EventUpdateInput = {
	name?: string;
	date?: string | Date;
	status?: string;
	openingSales?: string | Date | null;
	salesEnabled?: boolean;
	maxCapacity?: number | null;
	budget?: number | null;
	alcoholRevenue?: number | null;
	foodRevenue?: number | null;
	meta?: Record<string, unknown>;
};

// Product input types - matches Omit<Product, 'id'>
export type ProductCreateInput = {
	price: number;
	name: string;
	description: string;
	type: ProductType;
	maxQuantity: number | null;
	eventId?: string;
	admissionTier?: string;
	targetProductId?: string;
	promo?: boolean;
	meta: Record<string, unknown>;
};

export type ProductUpdateInput = {
	name?: string;
	price?: number;
	description?: string;
	status?: string;
	maxQuantity?: number | null;
	meta?: Record<string, unknown>;
};

// Promo input from route (createdBy is added by route)
export type PromoCreateInput = Omit<PromoInput, 'createdBy'>;

// Customer input type
export type CustomerCreateInput = {
	firstName: string;
	lastName: string;
	email: string;
	meta?: Record<string, unknown>;
};

// ============================================================================
// Guest Validators
// ============================================================================

export function validateGuestCreate(body: unknown): ValidationResult<GuestCreateInput> {
	if (!isRecordLike(body)) {
		return { valid: false, error: 'Request body must be an object' };
	}

	if (!isString(body.firstName) || body.firstName.trim() === '') {
		return { valid: false, error: 'firstName is required and must be a non-empty string' };
	}

	if (!isString(body.lastName) || body.lastName.trim() === '') {
		return { valid: false, error: 'lastName is required and must be a non-empty string' };
	}

	if (!isString(body.eventId)) {
		return { valid: false, error: 'eventId is required and must be a string' };
	}

	if (!isString(body.admissionTier)) {
		return { valid: false, error: 'admissionTier is required and must be a string' };
	}

	// Optional fields validation
	if (body.meta !== undefined && !isRecordLike(body.meta)) {
		return { valid: false, error: 'meta must be an object if provided' };
	}

	return {
		valid: true,
		data: {
			firstName: body.firstName,
			lastName: body.lastName,
			eventId: body.eventId,
			admissionTier: body.admissionTier,
			...(body.meta !== undefined ? { meta: body.meta as Record<string, unknown> } : {})
		}
	};
}

export function validateGuestUpdate(body: unknown): ValidationResult<GuestUpdateInput> {
	if (!isRecordLike(body)) {
		return { valid: false, error: 'Request body must be an object' };
	}

	const data: GuestUpdateInput = {};

	if (body.firstName !== undefined) {
		if (!isString(body.firstName) || body.firstName.trim() === '') {
			return { valid: false, error: 'firstName must be a non-empty string if provided' };
		}
		data.firstName = body.firstName;
	}

	if (body.lastName !== undefined) {
		if (!isString(body.lastName) || body.lastName.trim() === '') {
			return { valid: false, error: 'lastName must be a non-empty string if provided' };
		}
		data.lastName = body.lastName;
	}

	if (body.admissionTier !== undefined) {
		if (!isString(body.admissionTier)) {
			return { valid: false, error: 'admissionTier must be a string if provided' };
		}
		data.admissionTier = body.admissionTier;
	}

	if (body.status !== undefined) {
		if (body.status !== 'active' && body.status !== 'checked_in') {
			return { valid: false, error: 'status must be "active" or "checked_in" if provided' };
		}
		data.status = body.status;
	}

	if (body.meta !== undefined) {
		if (!isRecordLike(body.meta)) {
			return { valid: false, error: 'meta must be an object if provided' };
		}
		data.meta = body.meta as Record<string, unknown>;
	}

	return { valid: true, data };
}

// ============================================================================
// Event Validators
// ============================================================================

export function validateEventCreate(body: unknown): ValidationResult<EventCreateInput> {
	if (!isRecordLike(body)) {
		return { valid: false, error: 'Request body must be an object' };
	}

	if (!isString(body.name) || body.name.trim() === '') {
		return { valid: false, error: 'name is required and must be a non-empty string' };
	}

	if (body.date === undefined) {
		return { valid: false, error: 'date is required' };
	}

	const data: EventCreateInput = {
		name: body.name,
		date: body.date as string | Date
	};

	// Optional fields
	if (body.id !== undefined) {
		if (!isString(body.id)) {
			return { valid: false, error: 'id must be a string if provided' };
		}
		data.id = body.id;
	}

	if (body.openingSales !== undefined) {
		data.openingSales = body.openingSales as string | Date | null;
	}

	if (body.salesEnabled !== undefined) {
		if (!isBoolean(body.salesEnabled)) {
			return { valid: false, error: 'salesEnabled must be a boolean if provided' };
		}
		data.salesEnabled = body.salesEnabled;
	}

	if (body.maxCapacity !== undefined && body.maxCapacity !== null) {
		if (!isNumber(body.maxCapacity)) {
			return { valid: false, error: 'maxCapacity must be a number if provided' };
		}
		data.maxCapacity = body.maxCapacity;
	}

	if (body.budget !== undefined && body.budget !== null) {
		if (!isNumber(body.budget)) {
			return { valid: false, error: 'budget must be a number if provided' };
		}
		data.budget = body.budget;
	}

	if (body.alcoholRevenue !== undefined && body.alcoholRevenue !== null) {
		if (!isNumber(body.alcoholRevenue)) {
			return { valid: false, error: 'alcoholRevenue must be a number if provided' };
		}
		data.alcoholRevenue = body.alcoholRevenue;
	}

	if (body.foodRevenue !== undefined && body.foodRevenue !== null) {
		if (!isNumber(body.foodRevenue)) {
			return { valid: false, error: 'foodRevenue must be a number if provided' };
		}
		data.foodRevenue = body.foodRevenue;
	}

	if (body.meta !== undefined) {
		if (!isRecordLike(body.meta)) {
			return { valid: false, error: 'meta must be an object if provided' };
		}
		data.meta = body.meta as Record<string, unknown>;
	}

	return { valid: true, data };
}

export function validateEventUpdate(body: unknown): ValidationResult<EventUpdateInput> {
	if (!isRecordLike(body)) {
		return { valid: false, error: 'Request body must be an object' };
	}

	const data: EventUpdateInput = {};

	if (body.name !== undefined) {
		if (!isString(body.name) || body.name.trim() === '') {
			return { valid: false, error: 'name must be a non-empty string if provided' };
		}
		data.name = body.name;
	}

	if (body.date !== undefined) {
		data.date = body.date as string | Date;
	}

	if (body.status !== undefined) {
		if (!isString(body.status)) {
			return { valid: false, error: 'status must be a string if provided' };
		}
		data.status = body.status;
	}

	if (body.openingSales !== undefined) {
		data.openingSales = body.openingSales as string | Date | null;
	}

	if (body.salesEnabled !== undefined) {
		if (!isBoolean(body.salesEnabled)) {
			return { valid: false, error: 'salesEnabled must be a boolean if provided' };
		}
		data.salesEnabled = body.salesEnabled;
	}

	if (body.maxCapacity !== undefined) {
		if (body.maxCapacity !== null && !isNumber(body.maxCapacity)) {
			return { valid: false, error: 'maxCapacity must be a number or null if provided' };
		}
		data.maxCapacity = body.maxCapacity as number | null;
	}

	if (body.budget !== undefined) {
		if (body.budget !== null && !isNumber(body.budget)) {
			return { valid: false, error: 'budget must be a number or null if provided' };
		}
		data.budget = body.budget as number | null;
	}

	if (body.alcoholRevenue !== undefined) {
		if (body.alcoholRevenue !== null && !isNumber(body.alcoholRevenue)) {
			return { valid: false, error: 'alcoholRevenue must be a number or null if provided' };
		}
		data.alcoholRevenue = body.alcoholRevenue as number | null;
	}

	if (body.foodRevenue !== undefined) {
		if (body.foodRevenue !== null && !isNumber(body.foodRevenue)) {
			return { valid: false, error: 'foodRevenue must be a number or null if provided' };
		}
		data.foodRevenue = body.foodRevenue as number | null;
	}

	if (body.meta !== undefined) {
		if (!isRecordLike(body.meta)) {
			return { valid: false, error: 'meta must be an object if provided' };
		}
		data.meta = body.meta as Record<string, unknown>;
	}

	return { valid: true, data };
}

// ============================================================================
// Product Validators
// ============================================================================

const validProductTypes: ProductType[] = ['ticket', 'upgrade', 'bundle-ticket', 'accomodation'];

function isProductType(value: unknown): value is ProductType {
	return isString(value) && validProductTypes.includes(value as ProductType);
}

export function validateProductCreate(body: unknown): ValidationResult<ProductCreateInput> {
	if (!isRecordLike(body)) {
		return { valid: false, error: 'Request body must be an object' };
	}

	if (!isNumber(body.price)) {
		return { valid: false, error: 'price is required and must be a number' };
	}

	if (!isString(body.name) || body.name.trim() === '') {
		return { valid: false, error: 'name is required and must be a non-empty string' };
	}

	if (!isString(body.description)) {
		return { valid: false, error: 'description is required and must be a string' };
	}

	if (!isProductType(body.type)) {
		return { valid: false, error: `type is required and must be one of: ${validProductTypes.join(', ')}` };
	}

	// Conditional requirements based on type
	if (body.type === 'ticket' && (!isString(body.eventId) || !isString(body.admissionTier))) {
		return { valid: false, error: 'eventId and admissionTier are required for ticket type' };
	}

	if (body.type === 'upgrade' && (!isString(body.targetProductId) || !isString(body.admissionTier))) {
		return { valid: false, error: 'targetProductId and admissionTier are required for upgrade type' };
	}

	if (body.type === 'bundle-ticket' && (!isString(body.eventId) || !isString(body.targetProductId) || !isString(body.admissionTier))) {
		return { valid: false, error: 'eventId, targetProductId, and admissionTier are required for bundle-ticket type' };
	}

	if (body.type === 'accomodation' && (!isString(body.eventId) || !isString(body.admissionTier))) {
		return { valid: false, error: 'eventId and admissionTier are required for accomodation type' };
	}

	const data: ProductCreateInput = {
		price: body.price,
		name: body.name,
		description: body.description,
		type: body.type,
		maxQuantity: null,
		meta: {}
	};

	// Optional fields
	if (body.maxQuantity !== undefined && body.maxQuantity !== null) {
		if (!isNumber(body.maxQuantity)) {
			return { valid: false, error: 'maxQuantity must be a number if provided' };
		}
		data.maxQuantity = body.maxQuantity;
	}

	if (body.eventId !== undefined) {
		data.eventId = body.eventId as string;
	}

	if (body.admissionTier !== undefined) {
		data.admissionTier = body.admissionTier as string;
	}

	if (body.targetProductId !== undefined) {
		data.targetProductId = body.targetProductId as string;
	}

	if (body.promo !== undefined) {
		if (!isBoolean(body.promo)) {
			return { valid: false, error: 'promo must be a boolean if provided' };
		}
		data.promo = body.promo;
	}

	if (body.meta !== undefined) {
		if (!isRecordLike(body.meta)) {
			return { valid: false, error: 'meta must be an object if provided' };
		}
		data.meta = body.meta as Record<string, unknown>;
	}

	return { valid: true, data };
}

export function validateProductUpdate(body: unknown): ValidationResult<ProductUpdateInput> {
	if (!isRecordLike(body)) {
		return { valid: false, error: 'Request body must be an object' };
	}

	const data: ProductUpdateInput = {};

	if (body.name !== undefined) {
		if (!isString(body.name) || body.name.trim() === '') {
			return { valid: false, error: 'name must be a non-empty string if provided' };
		}
		data.name = body.name;
	}

	if (body.price !== undefined) {
		if (!isNumber(body.price)) {
			return { valid: false, error: 'price must be a number if provided' };
		}
		data.price = body.price;
	}

	if (body.description !== undefined) {
		if (!isString(body.description)) {
			return { valid: false, error: 'description must be a string if provided' };
		}
		data.description = body.description;
	}

	if (body.status !== undefined) {
		if (!isString(body.status)) {
			return { valid: false, error: 'status must be a string if provided' };
		}
		data.status = body.status;
	}

	if (body.maxQuantity !== undefined) {
		if (body.maxQuantity !== null && !isNumber(body.maxQuantity)) {
			return { valid: false, error: 'maxQuantity must be a number or null if provided' };
		}
		data.maxQuantity = body.maxQuantity as number | null;
	}

	if (body.meta !== undefined) {
		if (!isRecordLike(body.meta)) {
			return { valid: false, error: 'meta must be an object if provided' };
		}
		data.meta = body.meta as Record<string, unknown>;
	}

	return { valid: true, data };
}

// ============================================================================
// Promo Validators
// ============================================================================

const validPromoTypes: PromoType[] = ['single-use', 'coupon'];

function isPromoType(value: unknown): value is PromoType {
	return isString(value) && validPromoTypes.includes(value as PromoType);
}

export function validatePromoCreate(body: unknown): ValidationResult<PromoCreateInput> {
	if (!isRecordLike(body)) {
		return { valid: false, error: 'Request body must be an object' };
	}

	if (!isPromoType(body.type)) {
		return { valid: false, error: `type is required and must be one of: ${validPromoTypes.join(', ')}` };
	}

	if (!isString(body.productId)) {
		return { valid: false, error: 'productId is required and must be a string' };
	}

	if (body.meta !== undefined && !isRecordLike(body.meta)) {
		return { valid: false, error: 'meta must be an object if provided' };
	}

	// Conditional requirements for single-use
	if (body.type === 'single-use') {
		if (!isNumber(body.price)) {
			return { valid: false, error: 'price is required for single-use promos and must be a number' };
		}
		if (!isString(body.recipientName) || body.recipientName.trim() === '') {
			return { valid: false, error: 'recipientName is required for single-use promos and must be a non-empty string' };
		}
		if (body.price === 0) {
			if (!isString(body.recipientEmail) || body.recipientEmail.trim() === '') {
				return { valid: false, error: 'recipientEmail is required for comp (price 0) single-use promos' };
			}
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.recipientEmail)) {
				return { valid: false, error: 'recipientEmail must be a valid email address' };
			}
		}
		if (body.productQuantity !== undefined) {
			if (!isNumber(body.productQuantity) || body.productQuantity < 1 || body.productQuantity > 5) {
				return { valid: false, error: 'productQuantity must be a number between 1 and 5 for single-use promos' };
			}
		}
	}

	const data: PromoCreateInput = {
		type: body.type,
		productId: body.productId,
		meta: body.meta === undefined ? {} : (body.meta as Record<string, unknown>)
	};

	// Optional/conditional fields
	if (body.price !== undefined) {
		if (!isNumber(body.price)) {
			return { valid: false, error: 'price must be a number if provided' };
		}
		data.price = body.price;
	}

	if (body.flatDiscount !== undefined) {
		if (!isNumber(body.flatDiscount)) {
			return { valid: false, error: 'flatDiscount must be a number if provided' };
		}
		data.flatDiscount = body.flatDiscount;
	}

	if (body.percentDiscount !== undefined) {
		if (!isNumber(body.percentDiscount)) {
			return { valid: false, error: 'percentDiscount must be a number if provided' };
		}
		data.percentDiscount = body.percentDiscount;
	}

	if (body.productQuantity !== undefined) {
		data.productQuantity = body.productQuantity as number;
	}

	if (body.maxUses !== undefined) {
		if (!isNumber(body.maxUses)) {
			return { valid: false, error: 'maxUses must be a number if provided' };
		}
		data.maxUses = body.maxUses;
	}

	if (body.recipientName !== undefined) {
		data.recipientName = body.recipientName as string;
	}

	if (body.recipientEmail !== undefined) {
		data.recipientEmail = body.recipientEmail as string;
	}

	return { valid: true, data };
}

// ============================================================================
// Customer Validators
// ============================================================================

export function validateCustomerCreate(body: unknown): ValidationResult<CustomerCreateInput> {
	if (!isRecordLike(body)) {
		return { valid: false, error: 'Request body must be an object' };
	}

	if (!isString(body.firstName) || body.firstName.trim() === '') {
		return { valid: false, error: 'firstName is required and must be a non-empty string' };
	}

	if (!isString(body.lastName) || body.lastName.trim() === '') {
		return { valid: false, error: 'lastName is required and must be a non-empty string' };
	}

	if (!isString(body.email) || body.email.trim() === '') {
		return { valid: false, error: 'email is required and must be a non-empty string' };
	}

	const data: CustomerCreateInput = {
		firstName: body.firstName,
		lastName: body.lastName,
		email: body.email
	};

	if (body.meta !== undefined) {
		if (!isRecordLike(body.meta)) {
			return { valid: false, error: 'meta must be an object if provided' };
		}
		data.meta = body.meta as Record<string, unknown>;
	}

	return { valid: true, data };
}

// ============================================================================
// Order Validators (Most Critical)
// ============================================================================

export function validateOrderCreate(body: unknown): ValidationResult<OrderInput> {
	if (!isRecordLike(body)) {
		return { valid: false, error: 'Request body must be an object' };
	}

	// Validate paymentMethodNonce
	if (!isString(body.paymentMethodNonce) || body.paymentMethodNonce.trim() === '') {
		return { valid: false, error: 'paymentMethodNonce is required and must be a non-empty string' };
	}

	// Validate cart
	if (!isArray(body.cart)) {
		return { valid: false, error: 'cart is required and must be an array' };
	}

	if (body.cart.length === 0) {
		return { valid: false, error: 'cart must contain at least one item' };
	}

	const validatedCart: { productId: string; quantity: number }[] = [];
	for (let i = 0; i < body.cart.length; i++) {
		const item = body.cart[i];
		if (!isRecordLike(item)) {
			return { valid: false, error: `cart[${i}] must be an object` };
		}
		if (!isString(item.productId)) {
			return { valid: false, error: `cart[${i}].productId is required and must be a string` };
		}
		if (!isNumber(item.quantity) || item.quantity < 1) {
			return { valid: false, error: `cart[${i}].quantity is required and must be a positive number` };
		}
		validatedCart.push({
			productId: item.productId,
			quantity: item.quantity
		});
	}

	// Validate customer
	if (!isRecordLike(body.customer)) {
		return { valid: false, error: 'customer is required and must be an object' };
	}

	if (!isString(body.customer.firstName) || body.customer.firstName.trim() === '') {
		return { valid: false, error: 'customer.firstName is required and must be a non-empty string' };
	}

	if (!isString(body.customer.lastName) || body.customer.lastName.trim() === '') {
		return { valid: false, error: 'customer.lastName is required and must be a non-empty string' };
	}

	if (!isString(body.customer.email) || body.customer.email.trim() === '') {
		return { valid: false, error: 'customer.email is required and must be a non-empty string' };
	}

	const data: OrderInput = {
		paymentMethodNonce: body.paymentMethodNonce,
		cart: validatedCart,
		customer: {
			firstName: body.customer.firstName,
			lastName: body.customer.lastName,
			email: body.customer.email
		}
	};

	// Optional fields
	if (body.promoId !== undefined) {
		if (!isString(body.promoId)) {
			return { valid: false, error: 'promoId must be a string if provided' };
		}
		data.promoId = body.promoId;
	}

	if (body.targetGuestId !== undefined) {
		if (!isString(body.targetGuestId)) {
			return { valid: false, error: 'targetGuestId must be a string if provided' };
		}
		data.targetGuestId = body.targetGuestId;
	}

	return { valid: true, data };
}

// ============================================================================
// Transfer Tickets Validator
// ============================================================================

export type TransferTicketsInput = {
	transferee: {
		email: string;
		firstName: string;
		lastName: string;
	};
	guestIds: string[];
};

export function validateTransferTickets(body: unknown): ValidationResult<TransferTicketsInput> {
	if (!isRecordLike(body)) {
		return { valid: false, error: 'Request body must be an object' };
	}

	// Validate transferee
	if (!isRecordLike(body.transferee)) {
		return { valid: false, error: 'transferee is required and must be an object' };
	}

	if (!isString(body.transferee.email) || body.transferee.email.trim() === '') {
		return { valid: false, error: 'transferee.email is required and must be a non-empty string' };
	}

	if (!isString(body.transferee.firstName) || body.transferee.firstName.trim() === '') {
		return { valid: false, error: 'transferee.firstName is required and must be a non-empty string' };
	}

	if (!isString(body.transferee.lastName) || body.transferee.lastName.trim() === '') {
		return { valid: false, error: 'transferee.lastName is required and must be a non-empty string' };
	}

	// Validate guestIds
	if (!isArray(body.guestIds)) {
		return { valid: false, error: 'guestIds is required and must be an array' };
	}

	if (body.guestIds.length === 0) {
		return { valid: false, error: 'guestIds must contain at least one guest ID' };
	}

	for (let i = 0; i < body.guestIds.length; i++) {
		if (!isString(body.guestIds[i])) {
			return { valid: false, error: `guestIds[${i}] must be a string` };
		}
	}

	return {
		valid: true,
		data: {
			transferee: {
				email: body.transferee.email,
				firstName: body.transferee.firstName,
				lastName: body.transferee.lastName
			},
			guestIds: body.guestIds as string[]
		}
	};
}
