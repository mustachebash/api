/**
 * Events Service
 * Handles all event actions
 * @type {Object}
 */
import { sql } from '../utils/db.js';
import { v4 as uuidV4 } from 'uuid';

class EventsServiceError extends Error {
	code: string;
	context?: unknown;

	constructor(message = 'An unknown error occured', code = 'UNKNOWN', context?: unknown) {
		super(message);

		this.name = this.constructor.name;
		this.code = code;
		this.context = context;

		Error.captureStackTrace(this, this.constructor);
	}
}

const eventColumns = [
	'id',
	'name',
	'date',
	'status',
	'created',
	'updated',
	'opening_sales',
	'sales_enabled',
	'max_capacity',
	'budget',
	'alcohol_revenue',
	'food_revenue',
	'meta'
];

type EventStatus = 'active' | 'archived' | 'draft' | string;
export type Event = {
	id: string;
	name: string;
	date: Date;
	status: EventStatus;
	created: Date;
	updated: Date;
	openingSales: Date | null;
	salesEnabled: boolean;
	maxCapacity: number | null;
	budget: number | null;
	alcoholRevenue: number | null;
	foodRevenue: number | null;
	meta: Record<string, unknown>;
};

type EventInput = Partial<Omit<Event, 'created' | 'updated'>> & Pick<Event, 'name' | 'date'>;
type EventUpdate = Partial<Omit<Event, 'id' | 'created' | 'updated'>> & { updatedBy?: string };

type EventSummary = {
	eventId: string;
	totalGuests: number;
	totalPaidGuests: number;
	totalCompedGuests: number;
	totalVipGuests: number;
	guestsToday: number;
	checkedIn: number;
};
type EventSummaryRow = {
	eventId: string;
	totalGuests: number | string;
	totalPaidGuests: number | string;
	totalCompedGuests: number | string;
	totalVipGuests: number | string;
	guestsToday: number | string;
	checkedIn: number | string;
};

type EventSettingsProduct = {
	id: string;
	name: string;
	description: string;
	price: number;
	status: string;
	eventId: string;
	admissionTier: string;
	type: string;
	meta: Record<string, unknown>;
};

type EventSettings = {
	id: string;
	name: string;
	date: Date;
	openingSales: Date | null;
	salesEnabled: boolean;
	meta: Record<string, unknown>;
	products: EventSettingsProduct[];
};

type EventExtendedStats = {
	eventId: string;
	eventBudget: number;
	eventMaxCapacity: number | null;
	alcoholRevenue: number | null;
	foodRevenue: number | null;
	salesTiers: {name: string; quantity: number; price: number}[];
	totalRevenue: number;
	totalPromoRevenue: number;
	revenueToday: number;
	promoRevenueToday: number;
};
type EventExtendedStatsRow = Omit<EventExtendedStats, 'eventBudget' | 'alcoholRevenue' | 'foodRevenue' | 'revenueToday' | 'promoRevenueToday' | 'totalRevenue' | 'totalPromoRevenue'> & {
	eventBudget: number | string;
	alcoholRevenue: number | string | null;
	foodRevenue: number | string | null;
	revenueToday: number | string;
	promoRevenueToday: number | string;
	totalRevenue: number | string;
	totalPromoRevenue: number | string;
};

type EventTicketsByDay = {
	date: string;
	tickets: number;
};
type EventTicketsRow = {
	date: string;
	tickets: number | string;
};

type EventOpeningSalesPoint = {
	minuteCreated: string;
	tickets: number;
};
type EventOpeningSalesRow = {
	minuteCreated: string;
	tickets: number | string;
};

type EventCheckinsPoint = {
	minuteCheckedIn: string;
	checkins: number;
};
type EventCheckinsRow = {
	minuteCheckedIn: string;
	checkins: number | string;
};

const convertNumericTypeToNumbers = (e: Event): Event => ({
	...e,
	...(typeof e.alcoholRevenue === 'string' ? {alcoholRevenue: Number(e.alcoholRevenue)} : {}),
	...(typeof e.budget === 'string' ? {budget: Number(e.budget)} : {}),
	...(typeof e.foodRevenue === 'string' ? {foodRevenue: Number(e.foodRevenue)} : {})
});


export async function getEvents({ status }: {status?: string;}): Promise<Event[]> {
	try {
		const events = await sql<Event[]>`
			SELECT ${sql(eventColumns)}
			FROM events
			${status ? sql`WHERE status = ${status}` : sql``}
		`;

		return events.map(convertNumericTypeToNumbers);
	} catch(e) {
		throw new EventsServiceError('Could not query events', 'UNKNOWN', e);
	}
}

export async function getEvent(id: string): Promise<Event> {
	let event: Event;
	try {
		[event] = (await sql<Event[]>`
			SELECT ${sql(eventColumns)}
			FROM events
			WHERE id = ${id}
		`).map(convertNumericTypeToNumbers);
	} catch(e) {
		throw new EventsServiceError('Could not query event', 'UNKNOWN', e);
	}

	if(!event) throw new EventsServiceError('Event not found', 'NOT_FOUND');

	return event;
}

export async function createEvent(newEvent: EventInput): Promise<Event> {
	for(const u in newEvent) {
		// Fields whitelist
		if(![
			'id',
			'date',
			'name',
			'openingSales',
			'salesEnabled',
			'maxCapacity',
			'alcoholRevenue',
			'foodRevenue',
			'status',
			'budget',
			'meta'
		].includes(u)) throw new EventsServiceError('Invalid event data', 'INVALID');
	}

	const event: Omit<Event, 'created' | 'updated'> = {
		id: newEvent.id ?? uuidV4(),
		status: 'active',
		date: newEvent.date,
		name: newEvent.name,
		openingSales: newEvent.openingSales,
		salesEnabled: newEvent.salesEnabled,
		maxCapacity: newEvent.maxCapacity,
		budget: newEvent.budget,
		alcoholRevenue: newEvent.alcoholRevenue,
		foodRevenue: newEvent.foodRevenue,
		meta: {
			...newEvent.meta
		}
	};

	try {
		const [createdEvent] = (await sql<Event[]>`
			INSERT INTO events ${sql(event)}
			RETURNING ${sql(eventColumns)}
		`).map(convertNumericTypeToNumbers);

		return createdEvent;
	} catch(e) {
		throw new EventsServiceError('Could not create event', 'UNKNOWN', e);
	}
}

export async function updateEvent(id: string, updates: EventUpdate): Promise<Event> {
	for(const u in updates) {
		// Update whitelist
		if(![
			'date',
			'name',
			'openingSales',
			'salesEnabled',
			'maxCapacity',
			'alcoholRevenue',
			'foodRevenue',
			'status',
			'budget',
			'meta',
			'updatedBy'
		].includes(u)) throw new EventsServiceError('Invalid event data', 'INVALID');
	}

	if(Object.keys(updates).length === 1 && updates.updatedBy) throw new EventsServiceError('Invalid event data', 'INVALID');

	let event: Event;
	try {
		[event] = (await sql<Event[]>`
			UPDATE events
			SET ${sql(updates)}, updated = now()
			WHERE id = ${id}
			RETURNING ${sql(eventColumns)}
		`).map(convertNumericTypeToNumbers);
	} catch(e) {
		throw new EventsServiceError('Could not update event', 'UNKNOWN', e);
	}

	if(!event) throw new EventsServiceError('Event not found', 'NOT_FOUND');

	return event;
}

// !!! THIS GETS EXPOSED PUBLICLY
export async function getEventSettings(id: string): Promise<EventSettings> {
	let event: EventSettings;
	try {
		[event] = await sql<EventSettings[]>`
			SELECT
				e.id,
				e.name,
				e.date,
				e.opening_sales,
				e.sales_enabled,
				e.meta,
				COALESCE(
					ARRAY_AGG(
						JSON_BUILD_OBJECT(
							'id', p.id,
							'name', p.name,
							'description', p.description,
							'price', p.price,
							'status', p.status,
							'eventId', p.event_id,
							'admissionTier', p.admission_tier,
							'type', p.type,
							'meta', p.meta
						)
					) FILTER (WHERE p.id IS NOT NULL),
					'{}'::json[]
				) as products
			FROM events as e
			LEFT JOIN products p
				ON p.event_id = e.id
				AND p.promo = false
				AND p.admission_tier in ('general', 'vip')
			WHERE e.id = ${id}
			GROUP BY e.id
		`;
	} catch(e) {
		throw new EventsServiceError('Could not query event', 'UNKNOWN', e);
	}

	if(!event) throw new EventsServiceError('Event not found', 'NOT_FOUND');

	return event;
}

export async function getEventSummary(id: string): Promise<EventSummary> {
	try {
		const [summary] = (await sql<EventSummaryRow[]>`
			SELECT
				e.id as event_id,
				count(g.id) FILTER (WHERE g.status <> 'archived') as total_guests,
				count(g.id) FILTER (WHERE g.status <> 'archived' AND g.created_reason != 'comp') as total_paid_guests,
				count(g.id) FILTER (WHERE g.created_reason = 'comp') as total_comped_guests,
				count(g.id) FILTER (WHERE g.admission_tier = 'vip') as total_vip_guests,
				count(g.id) FILTER (
					WHERE (g.created AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')::date = (now() AT TIME ZONE 'America/Los_Angeles')::date
					AND g.created_reason = 'purchase'
					) as guests_today,
				count(g.id) FILTER (WHERE g.status = 'checked_in') as checked_in
			FROM events as e
			LEFT JOIN guests as g
				ON g.event_id = e.id
			WHERE e.id = ${id}
			GROUP BY e.id
		`).map<EventSummary>(s => ({
			...s,
			totalGuests: Number(s.totalGuests),
			totalPaidGuests: Number(s.totalPaidGuests),
			totalCompedGuests: Number(s.totalCompedGuests),
			totalVipGuests: Number(s.totalVipGuests),
			guestsToday: Number(s.guestsToday),
			checkedIn: Number(s.checkedIn)
		}));

		return summary;
	} catch(e) {
		throw new EventsServiceError('Could not query event summary', 'UNKNOWN', e);
	}
}

export async function getEventExtendedStats(id: string): Promise<EventExtendedStats> {
	try {
		const [extendedStats] = (await sql<EventExtendedStatsRow[]>`
			WITH ProductAggregation AS (
				SELECT
					p.event_id,
					p.name,
					p.price,
					p.promo,
					SUM(p.price * i.quantity) FILTER (WHERE o.promo_id IS NULL) as total_revenue,
					SUM(o.amount) FILTER (WHERE o.promo_id IS NOT NULL) as total_promo_revenue,
					SUM(i.quantity) AS total_quantity
				FROM products p
				LEFT JOIN order_items i ON i.product_id = p.id
				LEFT JOIN orders as o
					ON o.id = i.order_id
				WHERE 1 = 1
					AND o.status <> 'canceled'
					AND p.admission_tier IN ('general', 'vip')
					AND p.event_id = ${id}
				GROUP BY p.event_id, p.name, p.price, p.promo
			),
			OrdersAggregationToday AS (
				SELECT
					p.event_id as event_id,
					SUM(p.price * i.quantity) FILTER (WHERE o.promo_id IS NULL) as total_revenue,
					SUM(o.amount) FILTER (WHERE o.promo_id IS NOT NULL) as total_promo_revenue
				FROM orders as o
				LEFT JOIN order_items i
					ON i.order_id = o.id
				LEFT JOIN products p
					ON p.id = i.product_id
				WHERE (o.created AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')::date = (now() AT TIME ZONE 'America/Los_Angeles')::date
					AND p.event_id = ${id}
				GROUP BY p.event_id
			)
			SELECT
				e.id as event_id,
				e.budget as event_budget,
				e.max_capacity as event_max_capacity,
				e.alcohol_revenue as alcohol_revenue,
				e.food_revenue as food_revenue,
				COALESCE(
					ARRAY_AGG(
						JSON_BUILD_OBJECT(
							'name', pa.name,
							'quantity', pa.total_quantity,
							'price', pa.price
						)
					) FILTER (WHERE NOT pa.promo),
					'{}'::json[]
				) as sales_tiers,
				SUM(pa.price * pa.total_quantity) as total_revenue,
				SUM(pa.total_promo_revenue) as total_promo_revenue,
				coalesce(oa.total_revenue, 0) as revenue_today,
				coalesce(oa.total_promo_revenue, 0) as promo_revenue_today
			FROM events as e
			LEFT JOIN ProductAggregation as pa
				ON e.id = pa.event_id
			LEFT JOIN OrdersAggregationToday as oa
				ON e.id = oa.event_id
			WHERE e.id = ${id}
			GROUP BY e.id, revenue_today, promo_revenue_today
		`).map<EventExtendedStats>(({
			revenueToday,
			promoRevenueToday,
			totalRevenue,
			totalPromoRevenue,
			eventBudget,
			alcoholRevenue,
			foodRevenue,
			...rest
		}) => ({
			...rest,
			revenueToday: Number(revenueToday),
			promoRevenueToday: Number(promoRevenueToday),
			totalRevenue: Number(totalRevenue),
			totalPromoRevenue: Number(totalPromoRevenue),
			eventBudget: Number(eventBudget),
			alcoholRevenue: Number(alcoholRevenue),
			foodRevenue: Number(foodRevenue)
		}));

		return extendedStats;
	} catch(e) {
		throw new EventsServiceError('Could not query event extended stats', 'UNKNOWN', e);
	}
}

export async function getEventDailyTickets(id: string): Promise<EventTicketsByDay[]> {
	try {
		const chart = (await sql<EventTicketsRow[]>`
			SELECT
				(o.created AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')::DATE AS date,
				SUM(oi.quantity) as tickets
			FROM orders AS o
			LEFT JOIN order_items AS oi
				ON o.id = oi.order_id
			LEFT JOIN products AS p
				ON oi.product_id = p.id
			WHERE p.event_id = ${id}
			AND o.status != 'canceled'
			GROUP BY date
			ORDER BY 1 ASC;
		`).map<EventTicketsByDay>(row => ({
			...row,
			tickets: Number(row.tickets)
		}));

		return chart;
	} catch(e) {
		throw new EventsServiceError('Could not query event extended stats', 'UNKNOWN', e);
	}
}

export async function getOpeningSales(id: string): Promise<EventOpeningSalesPoint[]> {
	try {
		const chart = (await sql<EventOpeningSalesRow[]>`
			SELECT
				DATE_TRUNC('minute', (o.created AT TIME ZONE 'UTC')) AS minute_created,
				SUM(oi.quantity) as tickets
			FROM orders AS o
			LEFT JOIN order_items AS oi
				ON o.id = oi.order_id
			LEFT JOIN products AS p
				ON oi.product_id = p.id
			LEFT JOIN events AS e
				ON p.event_id = e.id
			WHERE
				p.event_id = ${id}
				AND (o.created AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')::DATE = (e.opening_sales AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')::DATE
			GROUP BY minute_created
			ORDER BY 1 ASC;
		`).map<EventOpeningSalesPoint>(row => ({
			...row,
			tickets: Number(row.tickets)
		}));


		return chart;
	} catch(e) {
		throw new EventsServiceError('Could not query event extended stats', 'UNKNOWN', e);
	}
}

export async function getEventCheckins(id: string): Promise<EventCheckinsPoint[]> {
	try {
		const chart = (await sql<EventCheckinsRow[]>`
			SELECT
				date_bin('15 minutes', (g.check_in_time AT TIME ZONE 'UTC'), TIMESTAMP '2010-01-01') AS minute_checked_in,
				count(g.id) as checkins
			FROM guests AS g
			WHERE g.event_id = ${id}
			AND g.status = 'checked_in'
			GROUP BY minute_checked_in
			ORDER BY 1 ASC;
		`).map<EventCheckinsPoint>(row => ({
			...row,
			checkins: Number(row.checkins)
		}));


		return chart;
	} catch(e) {
		throw new EventsServiceError('Could not query event extended stats', 'UNKNOWN', e);
	}
}
