# MCP integration — Phase 1 baseline

Inspected 2026-11-16. No application code, dependencies, database records, or deployment settings changed in this phase. Existing `.gitignore` and README edits were preserved.

## Architecture and intended boundary

Current: Next.js 16.4.6 / React 19.3.0 on Vercel; Supabase SSR authentication; Drizzle 0.45.4 with postgres-js and a server-side DATABASE_URL connection. Services contain business logic, server actions verify identity using `auth.getUser()`, and `src/proxy.ts` refreshes sessions and redirects unauthenticated private navigation. There is no MCP implementation remaining.

Target: embedded UI → same-origin backend verifying Supabase session → short-lived private MCP delegation → stateless Node.js MCP handler → shared services → database. Supabase OAuth Server stays disabled. The future model receives bounded business results, never credentials, approval capabilities, or database access. No LLM provider or full chat is selected.

Reuse services directly after hardening. Authentication is currently enforced by callers, so a new MCP caller must independently verify its context and permissions. Do not treat a service's userId parameter as authentication.

## Operation inventory

| MCP tool | Existing source | Required policy |
| --- | --- | --- |
| catalog_read | catalog.service: listProducts, getProductById, getProductBySku | Anonymous allowed; bounded public fields |
| cart_read | cart.service: getCart | Verified customer only |
| cart_write | addToCart, updateItemQuantity, removeItem | Verified customer; no additional confirmation; no clearCart exposure |
| profile_read | Verified Supabase user metadata.full_name | Display name only; no email or profile mutation |
| addresses_read | user.service: getAddresses | Verified customer ownership |
| addresses_write | addAddress, deleteAddress | Proposal only until trusted UI confirmation; no edit |
| orders_read | order.service: getUserOrders, getOrderDetails | Verified customer ownership |
| orders_write | cancelOrder | Proposal only until trusted UI confirmation |

Checkout stays at `/checkout`. Existing CheckoutClient invokes the createOrder server action; the service locks product rows in sorted order, checks/decrements stock conditionally, creates order/items, and clears the cart in one transaction. No payment processor execution was found in this flow. Never expose createOrderFromCart through MCP.

## Documentation comparison

- API documentation largely matches current service signatures and server actions. The only HTTP route is the auth callback; the documented actions are not REST endpoints.
- TypeScript types do not supply runtime boundary validation, contrary to the architecture overview's implication.
- `updateProfileName` exists but is absent from the API reference; it remains storefront-only.
- Cookie options are delegated to Supabase SSR; the documentation's blanket HTTP-only assertion is not established by explicit application configuration.
- Sorted product locks reduce deadlock risk; the documentation's claim that all circular deadlocks are impossible is too broad.
- Cart upsert increments atomically, but its preceding stock check is separate and can race.

## Required fixes and safeguards

1. Validate UUIDs, positive bounded integer add quantities, bounded set quantities, address strings/booleans, and cancellation reasons at shared service boundaries. Currently negative add quantities can create negative cart quantities; checkout then subtracts a negative quantity and can increase inventory or create invalid totals. Add database check constraints as defense in depth, after auditing existing records.
2. Make cart stock/bound checks and writes concurrency-safe. Serialize cart/checkout operations consistently: checkout currently reads cart without locking it, allowing simultaneous checkouts to consume the same snapshot, and its final whole-cart delete can discard concurrent additions.
3. Add durable retry/idempotency handling, especially incremental cart additions and address creation. Cancellation already uses an ownership-scoped conditional status update and transactional sorted restocking, preventing duplicate restock; preserve this guarantee and define safe retry responses.
4. Bound catalog, order, address and cart output; validate filters, use explicit response fields and deterministic pagination. Order listing currently adds one item-count query per order.
5. Preserve ownership predicates already present in private queries. Keep display-name-only profile output separate from the existing broader profile UI.
6. Make default-address updates and insertion transactional and concurrency-safe; currently they are separate operations.
7. Add a private API authentication path: the existing proxy redirects unknown unauthenticated paths to login, including a future MCP endpoint. Preserve storefront redirects while returning protocol-appropriate API errors.
8. Add internal signed delegation, anonymous catalog-only context, session revalidation, CSRF/origin checks, persisted confirmation proposals, atomic consumption, sanitized errors, request/result limits, distributed rate limits and redacted audit events in their respective later phases. These do not exist yet.
9. Establish least-privilege database access and staging isolation before integration tests or migrations. Direct Drizzle connections do not automatically inherit Supabase customer-session RLS context.

## Database verification limits

No RLS policies, grants, revokes, or database CHECK constraints are declared in the inspected schema/scripts. This does **not** establish deployed exposure: dashboard-managed policies may exist. No Supabase database inspection connector is available; live role privileges, RLS flags/policies, public API grants, exposed schemas, pooling configuration, and OAuth Server state remain unverified. Environment values were not printed. No database calls, seed scripts, migrations, or mutation tests were run.

Before Phase 2 database changes, inspect staging metadata only: current role and bypass-RLS privileges, table owners/RLS flags, pg_policies, and grants for anon/authenticated/application roles. Confirm which database the configured credentials reach and use isolated staging fixtures for concurrency tests.

## Baseline checks

- `npx tsc --noEmit --incremental false`: passed.
- `npm run lint`: failed with 3 errors and 10 warnings. Errors: two no-explicit-any violations in scripts/verify-invariants.ts and an empty interface in src/components/ui/input.tsx. Warnings cover unused declarations and anonymous default export.
- `npm run build`: failed fetching Inter from Google Fonts in restricted execution. Unrestricted retry failed with a Turbopack CSS worker/process panic for src/app/globals.css. Successful production build is not established.
- `npm test`: deliberately not run. Both existing suites use `.env.local` and mutate database records/inventory; no isolated staging target was verified.

Phase 1 inspection complete. Phase 2 has not started.

Follow-up: the owner reports Supabase RLS is enabled. Phase 2 implementation and its remaining verification/deployment requirements are recorded in MCP_PHASE2.md. The original observations above are retained as the pre-change baseline.
