# Phase 2 — shared domain hardening

Implemented locally on 2026-11-17. Phase 3 has not started. No Supabase migrations, production data writes, or deployments were performed.

Follow-up: Phase 3 is documented in MCP_PHASE3.md. Its cleanup replaces the legacy suites and resolves the historical lint issues listed below; the Phase 2 evidence is retained as a snapshot.

## Changes and decisions

- Shared runtime validation rejects malformed customer/resource UUIDs, fractional/negative/oversized quantities, invalid address fields/default flags and empty/overlong cancellation reasons. Quantity limits are 1–99 for additions, 0–99 for setting (zero removes). Cart limit: 100 distinct products. Address limit: 50. Existing oversized data fails explicitly instead of producing truncated totals.
- Every private service validates the customer ID and scopes customer records to it. The ID must still originate from verified authentication; validation alone is not authorization. Existing server actions continue using Supabase `auth.getUser()`.
- All customer writes and checkout acquire the same PostgreSQL transaction-scoped advisory lock for that customer before locking order/product rows. Product row locks remain deterministic. This prevents stale cart stock checks, duplicate checkout snapshots and checkout cleanup discarding a concurrent addition. Other customers can proceed concurrently; checkout still authoritatively reserves stock.
- All externally invoked domain mutations require a UUID request ID. A private database receipt binds customer, operation, request ID, normalized arguments and result. Receipt and write commit in one transaction; retries return the original result, changed arguments fail, and failed transactions leave neither mutation nor receipt. This also protects set/remove retries from undoing later changes. The internal clearCart helper remains unexposed and serialized.
- The storefront generates and retains retry keys while an intent is pending, and resets them after success. These are retry identifiers, not authorization capabilities. Future chat callers must preserve a key across retries; generating a new key is a new intent. The component helper retains keys in memory only: a reload/remount does not restore an uncertain request. No automatic network retry is introduced.
- Default-address changes and insertion are atomic. A partial unique index also enforces one default per customer. Cancellation retains its ownership/status conditional update and transactional single restock; retries with the same key succeed without another restock. A new key against an already-cancelled order fails without changing stock.
- Catalogue/order lists use explicit fields, validated limit/offset bounds (default 50, max 100, offset max 100,000) and stable ID tie-breakers. Storefront pages show 24 records with next/previous navigation. Order item counts use a single SQL query rather than one query per order. Address responses omit customer IDs and timestamps; order summaries omit address data. Order detail output is explicit and bounded to 100 items.
- Checkout validates legacy cart quantities and monetary bounds before committing. Order numbers now use 96 random bits to avoid the short previous namespace's collision risk. Checkout and profile editing remain storefront operations; no MCP transport or tools were added.
- Mutation actions return controlled domain messages or a generic failure. Database exceptions, SQL and customer values are not passed through to the browser.

## Database changes — pending staging application

`migrations/phase2-domain-hardening.sql` creates private mutation_receipts, enables RLS on that table, explicitly revokes PUBLIC/anon/authenticated access (including inherited default table grants), adds positive quantity/nonnegative money/stock checks and useful indexes. Existing table RLS/policies remain untouched. Existing-row CHECK validation is deliberately deferred; NOT VALID still rejects invalid new/updated rows.

**The migration is required before deploying this code.** All mutation paths use the receipt table. It was applied only inside disposable local test databases. Do not deploy application changes against an unmigrated database.

Staging sequence:

1. Confirm an isolated staging database and app deployment; use staging-only credentials. Take a backup and record existing policies/grants. Run `migrations/phase2-inspect-privileges.sql` read-only, as the actual application role. Audit invalid quantities/money, excessive carts/address books/order sizes, and duplicate address defaults. Resolve existing anomalies explicitly; the migration does not rewrite customer records.
2. Apply the domain-hardening SQL once. Duplicate defaults deliberately cause a transaction rollback. Check existing constraint/index names before applying if the database has manual changes. Do not use schema push against production as a substitute.
3. Verify that only the intended server role can SELECT/INSERT receipts. RLS being enabled does not constrain superusers, BYPASSRLS roles or table owners unless FORCE RLS applies. A direct Drizzle connection does not carry the Supabase customer's JWT/session context. Never grant browser roles access to receipts or rely on RLS instead of application ownership checks.
4. If using a restricted application role, grant only required table/column privileges and a server-role-only receipt policy explicitly; the migration does not guess/create a role or grant broad access. Keep migration/admin credentials separate. For existing customer policies, verify how the actual direct role is authorized. Catalogue needs SELECT; cart/address need scoped reads/writes; orders/items need reads and storefront inserts; orders and inventory need constrained updates. Avoid DDL privileges in the application role.
5. After auditing/fixing historical data, validate cart_quantity_bounds, product_nonnegative, order_item_positive and order_total_nonnegative with ALTER TABLE ... VALIDATE CONSTRAINT. Smoke-test catalogue pagination, cart changes, address defaults, checkout and cancellation on staging.
6. Keep receipt records private and do not log their results: address receipts contain customer address data needed for replay. Do not purge receipt keys casually: deletion permits delayed requests to execute again. A later retention design should retain rejection tombstones or permanently reject expired keys. Before reusing a request key, compare exact normalized arguments.

Rollback: stop writes first and restore the previous application version. Keep receipt data/indexes/constraints during initial rollback; they protect integrity and preserve replay history. A database rollback/drop requires a separate reviewed migration and backup, because dropping receipts destroys retry guarantees. No production rollback or migration is authorized by this phase.

## RLS and credential verification limits

The owner reports RLS is enabled in Supabase. Read-only inspection of the configured application role was attempted without printing secrets. Restricted execution failed DNS; network-enabled execution failed TLS certificate-chain verification, including when using the OS trust store. Certificate verification was not disabled. Actual application-role privileges, table ownership/bypass privileges and deployed policy contents remain unverified. Configure a trusted CA through the execution environment and rerun:

`node --use-system-ca --import tsx --env-file=.env.local scripts/inspect-db-privileges.ts`

The script uses a read-only transaction, strict TLS and metadata-only output. The application connection configuration was not changed. No new environment secret is required. Existing DATABASE_URL/DIRECT_URL must remain server-only; NEXT_PUBLIC values are Supabase's public URL/publishable or anon key, never a service-role key. The example environment file contains placeholders.

## Verification evidence

- `npm test` / `npm run test:domain`: 15 groups passed against a new loopback-only PostgreSQL cluster, using real concurrent connections. The suite replaces inherited database URLs and never loads local environment files or contacts Supabase.
- Covered invalid input and negative-quantity exploit; direct database constraints; browser-role denial on receipts despite permissive default grants; cross-customer cart/address/order isolation; stock-bounded concurrent additions; duplicate/tampered/user-scoped keys; stale set/remove replay; double checkout; checkout/add races; competing customers/overselling; concurrent cancellation/retries/status restrictions; address-default and cancellation rollback; receipt-insert rollback; stable pagination and literal wildcard searches; and error sanitization.
- `npx tsc --noEmit --incremental false`: passed.
- `git diff --check`: passed.
- `npm run lint`: existing 3 errors and 10 warnings remain (same baseline categories: legacy invariant-test any types and ui/input empty interface, plus unused declarations/default export). No new lint diagnostics were introduced.
- `npm run build`: still fails at the baseline Turbopack CSS-worker/process panic for globals.css. A successful production build is not established.
- The initial local PostgreSQL run hit sandbox filesystem restrictions during WAL initialization; the approved run outside the sandbox passed. The test dependency is pinned, development-only embedded-postgres; its local PostgreSQL version is not proof of compatibility with the unverified deployed Supabase version. Supabase staging checks remain required.
- Existing database-mutating legacy suites were not run. They now require THREADCORE_STAGING_TESTS=1 and explicit staging credentials; `npm test` defaults to safe local tests instead. The dependency install reported 11 moderate audit findings; dependency remediation remains for Phase 7.
