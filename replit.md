# Dropcart Store

Direct-to-product dropshipping storefront with a secure operator console for catalog, orders, and performance analytics.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/dropcart-store/` — storefront and admin console React app.
- `artifacts/api-server/src/routes/store.ts` — catalog, order, analytics, and event API routes.
- `lib/api-spec/openapi.yaml` — source-of-truth API contract and generated client hooks.
- `artifacts/dropcart-store/src/index.css` — shared storefront/admin visual language.

## Architecture decisions

- The public root route is a direct product detail page; there is intentionally no marketing homepage.
- Admin APIs for orders, analytics, and catalog mutations require Clerk authentication; catalog reads, order creation, and analytics event tracking remain public.
- Delivery promises are calculated from the selected payment method: COD uses the standard ten-day window and UPI uses the faster five-day window.

## Product

- Customers can browse a rich product gallery, inspect reviews/highlights, choose quantity and payment method, place an order, and see a confirmation animation with delivery timing.
- Operators can sign in through Clerk, review traffic and conversion analytics, edit/add/remove product listings, and move orders through fulfilment statuses.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
