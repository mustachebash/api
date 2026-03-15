# Mustache Bash API

## Overview

Koa.js REST API written in TypeScript. Handles all business logic for events, tickets, orders, guests, customers, products, promos, transactions, and users. Listens on port 4000.

## Tech Stack

- **Runtime**: Node.js (ESM, TypeScript via `tsx` in dev)
- **Framework**: Koa 2 + `@koa/router` + `koa-bodyparser`
- **Database**: PostgreSQL via `postgres` npm package
- **Auth**: JWT (`jsonwebtoken`) + Google OAuth (`google-auth-library`)
- **Payments**: Braintree
- **Email**: Mailgun + Mailchimp
- **Logging**: Pino

## Project Structure

```
lib/
├── index.ts          # App entry — Koa setup, middleware chain, port 4000
├── config.ts         # All env var config (postgres, jwt, google, mailgun, mailchimp, braintree)
├── routes/           # Route handlers (one file per resource)
│   ├── index.ts
│   ├── events.ts, guests.ts, orders.ts, products.ts
│   ├── promos.ts, sites.ts, transactions.ts, users.ts
│   └── customers.ts
├── services/         # Business logic (one file per domain)
│   ├── auth.ts, customers.ts, email.ts, events.ts
│   ├── guests.ts, orders.ts, products.ts, promos.ts
│   ├── tickets.ts, transactions.ts
└── middleware/
    └── auth.ts       # JWT auth middleware
```

## Commands

```bash
npm run dev       # tsx watch (hot reload, used in Docker dev)
npm run build     # tsc → dist/
npm start         # node dist/index.js (production)
npm test          # eslint + prettier check + tsc --noEmit
npm run format    # prettier --write
```

## API Routes

All routes are under `/v1`. Auth middleware is applied per-router — check individual route files.

## Environment Variables

All required vars are pulled from `lib/config.ts`. In Docker dev, most are set directly in `docker-compose.yml`. Sensitive keys (Mailgun, Mailchimp, Braintree) come from `../secrets/.env`.

Key vars:

- `POSTGRES_HOST/PORT/USERNAME/PASSWORD/DATABASE`
- `JWT_SECRET`, `JWT_ORDER_SECRET`, `JWT_TICKET_SECRET`
- `GOOGLE_IDENTITY_CLIENT_ID`
- `MAILGUN_DOMAIN`, `MAILGUN_API_KEY`
- `MAILCHIMP_DOMAIN`, `MAILCHIMP_API_KEY`
- `BRAINTREE_ENV`, `BRAINTREE_MERCHANT_ID`, `BRAINTREE_PUBLIC_KEY`, `BRAINTREE_PRIVATE_KEY`

## CORS

- Dev: allows `*.localhost` and `*.local.mrstache.io` origins
- Production: allows `*.mustachebash.com` only

## Type Patterns

- `AppContext` — the typed Koa context (re-exported from `index.ts`)
- `AppMiddleware` — typed middleware signature
- `ctx.state.user` — attached by auth middleware
- `ctx.state.log` — per-request Pino child logger

## Build Notes

- Output goes to `dist/` (deleted by `api-installer` service in Docker on restart)
- `"type": "module"` — all imports must use `.js` extensions (resolved to `.ts` by tsx)
