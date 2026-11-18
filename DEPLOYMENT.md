# Threadcore deployment guide

This guide updates your **existing Git repository, existing Vercel storefront project, and existing Supabase database/authentication** with the private MCP integration. Do not create another production storefront, import the repository as a new Vercel project, replace existing customer accounts, or recreate the database. The full conversational chat is not built. The interactive playground is a separate local-only developer tool and must not be used as the production server.

The repository is https://github.com/NeelScorpKingltd/Threadcore-StoreFront and the currently documented storefront is https://threadcore-beta.vercel.app/. Verify the actual canonical domain in your existing Vercel project before setting THREADCORE_APP_ORIGIN; use a custom domain instead if that is the storefront's canonical origin.

Latest verification (2026-11-17): production build, type checking, lint, 14 authentication test groups, the official SDK transport harness and 22 isolated PostgreSQL groups passed. Removing the redundant custom Tailwind CSS loader resolved the previous local Turbopack build failure. Earlier phase notes describe historical failures; this guide records the current deployment state.

Cleanup removed five unreferenced starter SVGs, three unused UI primitives and the unmounted duplicate ChatIntegrationHarness. The reusable confirmation card, working playground, regression suites, migration history and read-only privilege utility are retained intentionally. The unused loader dependency and its seven-package dependency subtree were removed from the lockfile.

## Code structure

```text
src/
  app/
    (auth)/                   Login / signup
    (shop)/                   Catalogue, cart, profile, checkout, orders
    actions/                  Storefront Server Actions; derive verified customer
    api/auth/callback/        Supabase callback
    api/mcp/route.ts          Private stateless MCP HTTP endpoint (Node.js)
    api/chat/tools/route.ts   Same-origin browser-to-MCP integration endpoint
    api/chat/confirm/route.ts Trusted confirmation list / Confirm / Reject
  lib/
    chat/adapter.ts           Request-local SDK client, hidden credentials, UI/model contracts
    mcp-auth/                 Delegation signing, permission/session checks, CSRF, configuration
    mcp/server.ts             Eight grouped tools and validated schemas
    mcp/handler.ts            Stateless official SDK transport and response limits
    mcp/pending.ts            Durable proposal and atomic confirmation state machine
    mcp/confirmation-schema.ts Strict browser confirmation input
    domain/                  Validation, safe errors, transaction context and retry receipts
    db/                      PostgreSQL connection, Drizzle schema, optional demo seed
    supabase/                Browser/server clients, proxy session handling, safe redirects
  services/                  Shared catalogue/cart/address/order business logic
  components/                Storefront UI and reusable trusted confirmation card
  proxy.ts                   Storefront session refresh; API handlers authenticate themselves
migrations/                  Reviewed SQL upgrades and read-only metadata inspection
scripts/
  test-mcp-auth.ts            Offline credential/identity/CSRF checks
  test-mcp-transport.ts       Official SDK client/transport checks
  test-domain-isolated.ts    Real PostgreSQL domain/confirmation regression tests
  inspect-db-privileges.ts   Read-only role/RLS inspection
  mcp-playground.ts/.html    Disposable local interactive playground
```

Flow: browser → same-origin chat endpoint → private signed MCP request → shared services → Supabase PostgreSQL. Sensitive changes go through a separate trusted confirmation endpoint. Checkout remains the existing storefront `/checkout` flow. OAuth Server stays disabled.

## 1. Prepare isolated staging

Create a working branch (for example codex/mcp-rollout) in the existing repository. Confirm the existing Vercel project's linked repository, root directory and Production Branch before pushing: a push to its Production Branch may release automatically. Keep the MCP changes off that branch until migrations and verification are ready.

Use a non-production Preview/staging deployment of the existing Vercel project, backed by a separate Supabase staging project/database with the existing storefront schema and synthetic test data. This staging copy is only for verification; the existing Supabase project remains the production database/authentication service. Never give a Preview deployment production database credentials or production signing keys. Configure a stable exact staging origin; arbitrary generated preview origins will fail the intentional origin check unless configured for that deployment.

Before deploying, back up the target database and review the actual application role, grants, RLS flags/policies, invalid legacy quantities and duplicate address defaults. Use `migrations/phase2-inspect-privileges.sql` or the read-only inspection utility. RLS being enabled does not constrain a direct connection that owns tables or bypasses RLS. The earlier live inspection failed TLS certificate validation; configure the appropriate trusted CA, never disable certificate verification to bypass this.

This migration sequence upgrades the **existing storefront schema**. It adds MCP state tables and a session-check function, plus domain constraints/indexes; it does not replace products, carts, addresses, orders or Supabase Auth. Do not run it blindly against an empty database or an environment where these changes already exist. When preparing the staging copy, establish the existing schema first and reconcile migration history rather than mixing schema-push with these CREATE statements. Keep staging user accounts separate from real customer accounts.

## 2. Apply reviewed migrations to staging

Run through the Supabase SQL editor or a reviewed migration runner using a migration/admin connection, in this order:

1. `migrations/phase2-domain-hardening.sql`
2. `migrations/phase3-session-verification.sql`
3. `migrations/phase5-pending-actions.sql`

They are **not** run automatically by the Vercel build. Do not run db:seed on production. Resolve legacy anomalies explicitly; the first migration intentionally fails if default addresses conflict. After historical data is audited/repaired, validate its NOT VALID constraints separately.

Phase 3 requires the migration owner to have reviewed access to `auth.sessions(id,user_id,not_after)`. The application needs EXECUTE on `public.threadcore_session_is_active(uuid,uuid)`, but not raw access to auth.sessions. Restrict execution to the reviewed server role; PUBLIC/anon/authenticated must not have access.

The application also needs appropriate existing storefront table privileges and SELECT/INSERT on mutation_receipts plus SELECT/INSERT/UPDATE on pending_actions. Private tables have RLS and no browser policies. If the application role does not own/bypass these tables, add narrowly scoped server-role-only policies and grants after reviewing the actual role. No guessed role name or broad browser policy is provided.

If an environment applied the earlier partial Phase 5 draft, stop before this step: reconcile legacy approved records and write an explicit upgrade/backfill for preview and expired status. Do not overwrite existing records, fabricate previews, or rerun CREATE TABLE.

## 3. Configure Vercel environment variables

Open **your existing Vercel project → Settings → Environment Variables**. Preserve the working Production Supabase URL/key and database connection values, subject to the privilege/pooling review below. Add the five THREADCORE_* variables for MCP; do not replace production credentials with demo/staging values. Configure Preview/staging separately with its own Supabase project and keys. Environment changes require a new deployment. Never commit real values or put server-only variables behind NEXT_PUBLIC.

| Variable | Purpose |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Root Supabase project URL, without /rest/v1 or /auth/v1 |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Public anon/publishable key, never service-role key |
| DATABASE_URL | Server-only application transaction-pooler connection |
| DIRECT_URL | Migration tooling connection; only needed where migration tooling runs |
| THREADCORE_APP_ORIGIN | Exact HTTPS deployment origin, no trailing slash |
| THREADCORE_MCP_ISSUER | Unique environment-specific issuer, e.g. urn:threadcore:staging:backend |
| THREADCORE_MCP_AUDIENCE | Unique environment-specific audience, e.g. urn:threadcore:staging:mcp |
| THREADCORE_MCP_SIGNING_KID | Active key ID |
| THREADCORE_MCP_SIGNING_KEYS | Secret JSON map of key IDs to random 32-byte base64url keys |

Generate the signing material in your secret manager using cryptographically secure randomness. The key-map format is `{"key-id":"<32-byte-base64url-secret>"}`; that is a format example, not a real key. Use up to three keys for rotation. Retain an old verification key until all old issuer instances have drained and their 30-second credentials have expired. See MCP_PHASE3.md for rotation/revocation behavior.

Use Supabase's transaction pooler connection for serverless application queries; postgres-js is configured with prepare:false. Review per-instance pool size, TLS and total connection budget for your Vercel concurrency before production. Use a separate migration connection/role rather than giving the app DDL permissions. [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres/serverless-drivers)

## 4. Verify the existing authentication and Vercel configuration

Keep the existing production Supabase authentication setup, Site URL, customer accounts, providers and callback settings. Verify that the canonical production origin's `/api/auth/callback` remains allowed; change it only if the actual domain requires it. Configure the staging project's Site URL and callback allowlist separately. Confirm the existing email/password signup/login behavior and email confirmation settings. MCP reuses these sessions; it needs neither a new login system nor Supabase OAuth Server.

In the existing Vercel project, verify the current project root and Next.js preset. Use `npm ci` for installation and `npm run build` for the build command; let Vercel manage the output directory. Keep the pinned lockfile. Select a supported Node runtime compatible with the installed Next.js/SDK and your verified build (the local checks used Node 26). Review the existing function region against Supabase's region rather than creating a second project. The MCP route explicitly uses Node.js and maxDuration=30; confirm your plan/runtime supports the configured duration. The new `/api/mcp` and `/api/chat/*` routes deploy with the storefront; no separate MCP hosting service is required.

The adapter self-fetches the exact configured origin's `/api/mcp`. Verify that Vercel Deployment Protection permits this internal call in staging. The adapter does not currently inject an automation bypass secret; if your setup blocks it, configure and review a server-only bypass integration before rollout, without exposing bypass material to the browser/model or broadly disabling protection. Never use an arbitrary redirect/target URL. [Vercel protection guidance](https://vercel.com/docs/deployment-protection)

Environment isolation is controlled in Vercel's Preview/Production settings. [Vercel environment variables](https://vercel.com/docs/environment-variables)

## 5. Verify before rollout

Locally/CI run:

```sh
npm ci
npm run lint
npx tsc --noEmit --incremental false
npm test
npm run build
```

The domain suite starts disposable local PostgreSQL and requires its platform binaries/install scripts. Do not substitute production credentials for local test failures. It never loads `.env.local`. `npm run mcp:playground` is local-only demo authentication and data; its success is not proof of live Supabase/Vercel behavior.

On isolated staging, verify anonymous catalogue only; logged-in cart operations; private reads; readable pending cards; Confirm/Reject/retry/expiry; changed order status; account switching and logout; fixed checkout navigation; and invalid/forged credentials. Confirm cookie/session refresh survives real browser requests. Verify that no raw session tokens, signing keys, proposal capabilities or address/order bodies enter model logs/history.

No full chat is mounted yet. Integrate a future chat with `withChatTools`, keep uiResult separate from modelResult/history, and render `McpConfirmationCard` only using the authenticated confirmation-list response. Cards submit only ID/decision; never let a model invoke confirmation. The local playground is not part of Vercel routing.

## 6. Production gate and rollback

Production readiness still requires the remaining Phase 7 work: distributed rate limits, redacted audit events, dependency/security review, request/result limits on all browser paths, connection/runtime review, artifact/secret scanning and successful live staging checks. Do not label the local prototype production-ready from test results alone. The installation currently reports 11 moderate dependency findings that need review.

After these gates pass, separately authorize production migrations and release. Apply reviewed compatible migrations before code requiring the new tables/functions. Use production-only secrets and Supabase URLs. Do not promote a staging configuration with staging credentials as production.

For the existing live site, use this release order:

1. Record the last known-good Git commit/Vercel deployment and back up the existing Supabase database. Review any compatibility effect of the new quantity bounds/default-address constraint on the currently deployed code.
2. Complete the reviewed production schema upgrades and server-role grants during the authorized release window. Keep existing data and authentication intact. Do not run db:seed, reset the database, or replay already-applied migrations.
3. Add the production MCP environment variables to the existing Vercel project. Set the exact canonical storefront origin and independent production issuer/audience/signing keys; retain the existing production Supabase connection settings.
4. Merge the verified changes into the existing project's configured Production Branch, or deploy the approved commit through that project's established release workflow. Commit the lockfile and reviewed migrations with the code. Git changes that exist only in the local workspace have not reached Vercel until committed/pushed and deployed.
5. Verify existing storefront browsing, login, cart, checkout and orders, then the private MCP/authentication/confirmation paths. The chat itself is not yet mounted; deploying these APIs does not create a conversational widget. Monitor failures and keep the previous deployment available for rollback.

For rollback, stop/disable chat writes first and roll back application code. Keep receipts, proposals and integrity constraints initially: deleting them destroys replay/history guarantees. Schema rollback requires a separate reviewed plan and backup. No production deployment or database migration was performed while preparing this guide.
