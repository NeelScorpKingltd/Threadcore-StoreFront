# MCP production readiness and chat roadmap

Updated: 2026-11-18

## Current status

The MCP integration is **staging-only and not production-ready**. The Preview tester can authenticate, discover all eight tools, and complete a `cart_read` call. This proves one live read path, not the complete security, write, confirmation, or operational lifecycle. The first local data-minimization change below is complete and type/lint checked, but has not yet been pushed or deployed to Preview.

The tester at `/mcp-test` is Preview/local-development only. It is a manual tool caller, not a conversational chat, and no LLM provider or ReAct agent is connected. Do not expose it in Production or promote staging credentials, signing keys, or the Preview protection-bypass secret.

## Findings to close before production

### Data sent to a future model

- The live `cart_read` sample included the customer `userId`, cart and product IDs, creation time, inventory count, and image URL. The first local fix now gives `modelResult` a curated cart projection without the customer UUID, timestamp, inventory count, image URL, or duplicated MCP wrapper. Opaque cart/product IDs remain only where needed for authorized follow-up cart calls. The UI result remains full for the signed-in customer's UI; further UI minimization is a later item.
- `uiResult`, `modelResult`, `content`, and `structuredContent` currently duplicate much of the same response. The test console is intentionally verbose for diagnostics. The future chat UI should render a compact, human-readable projection and should not persist the MCP envelope.
- Continue withholding address/order bodies from model context. Pending action IDs and confirmation capabilities must remain exclusively in the authenticated UI/API flow.

### Resource and abuse controls

- `/api/chat/tools` parses the browser body with `request.json()` and has no explicit streaming/body-size bound. The MCP transport has a 64 KiB input limit, but that is downstream of the browser adapter.
- `/api/chat/confirm` reads the full body before enforcing its 4 KiB limit. Enforce the limit while streaming/reading, before allocating an unbounded body.
- Add explicit request, response, tool-call count, concurrency, and execution-time budgets on every browser-facing path. The MCP tool result limit alone does not cap the adapter's complete response or the model context.
- Add distributed per-customer and broader abuse rate limits to chat tools, MCP, and confirmation endpoints. Authentication does not prevent a valid user or bot from exhausting database/auth capacity.

### Operational security

- Add structured, redacted audit events for authenticated tool calls, proposal lifecycle transitions, denials, and failures. Use correlation IDs and safe error categories; never log cookies, bearer/session tokens, signing keys, bypass secrets, full address/order bodies, or unrestricted tool arguments/results.
- The generic `AUTH_UNAVAILABLE` response is appropriately opaque to clients, but safe server-side failure categories are needed to distinguish configuration, Supabase verification, database session checks, and protected internal transport failures.
- Triage the 11 moderate dependency findings recorded in `DEPLOYMENT.md`; review advisories and runtime exposure before choosing upgrades. Run dependency, source-secret, and deployment-artifact scans.
- Review Vercel runtime/region, PostgreSQL pool/connection limits, TLS, timeout behavior, and monitoring under realistic concurrency.
- The Preview automation bypass secret is project-wide capability material. Code sends it only server-side, only when `VERCEL_ENV=preview`, and only to the fixed MCP endpoint. Keep it secret and rotate/revoke it if exposed.

### Database and live acceptance

- Production database role, grants, RLS behavior, existing data compatibility, and the production migration plan have not been verified. RLS being enabled does not prove a direct server connection is constrained by it.
- Before a production migration, back up the database and audit legacy quantities/default-address conflicts; apply reviewed migrations in order and verify the actual server role's narrow privileges. Never grant browser roles access to private MCP tables/session checks or raw `auth.sessions`.
- Live staging verification is incomplete. Exercise anonymous catalogue access, authenticated private reads, cart add/set/remove, account switching/logout, forged/expired credentials, invalid schemas, body/result limits, rate limits, and protected-deployment self-fetch.
- Exercise address/order proposal creation, saved previews, reject/confirm, expiry, duplicate/replayed decisions, concurrent decisions, changed order state, and rollback after injected failures. Confirm the Phase 5 schema is installed in staging before these checks.
- Existing local suites cover important auth/transport/domain invariants, but local tests are not a substitute for live staging behavior. Lint and TypeScript passed after the Preview bypass integration; a local production build has encountered a Google Fonts network failure and a Turbopack CSS-worker panic. Require a clean Vercel Preview build and deployment before any release decision.

## Logical implementation sequence

Complete one item, review it, and report its verification before moving to the next.

1. **Minimize model-visible cart data** — remove the customer UUID and unrelated fields; provide only the cart projection and opaque references needed for safe follow-up tool calls. *(Implemented locally; lint and TypeScript pass; awaiting Preview deployment.)*
2. **Bound all browser requests and responses** — enforce streamed byte limits before JSON parsing, cap serialized adapter responses, and reject oversized arguments/results consistently.
3. **Add distributed rate limits and execution budgets** — per-user/IP protections as appropriate, concurrency limits, bounded tool calls, and timeouts.
4. **Add redacted audit and safe diagnostics** — event allowlist, correlation IDs, retention/access controls, no secrets or raw private payloads.
5. **Complete dependency/runtime/secret review** — triage advisories, scan source and deployment artifacts, and verify connection/TLS/runtime budgets.
6. **Complete staging security and integrity acceptance** — run the scenarios above against the isolated Supabase Preview and record results.
7. **Build the ReAct backend** — add a provider-neutral model adapter after output filtering and budgets exist. The model receives only allowlisted tool schemas and minimized history. Each turn is bounded by max tool calls, steps, tokens, output bytes, and wall time. Validate every proposed tool name/argument server-side; derive identity only from the verified session; reauthorize every tool call. Tool results return to the model only after filtering. The model may propose address/order changes but cannot approve them, access confirmation IDs, initiate checkout, or perform payment.
8. **Build the authenticated chat UI** — conversation list/composer, loading/error states, tool activity, cancellation/retry handling, and accessible rendering. Render address/order previews from the separate authenticated pending-confirmation endpoint; only a human's Confirm/Reject action sends proposal ID/decision. Keep private UI data out of model history and clear client state on logout/account switch. Do not mount the Preview tester in Production.
9. **Production release gate** — independently provision production origin/issuer/audience/signing keys, review production grants and migrations, back up, run compatibility checks, deploy through the configured Production Branch, and verify storefront plus MCP/confirmation paths with monitoring and rollback ready.

## ReAct flow to implement

```text
Browser chat UI
  -> same-origin authenticated chat API (CSRF/origin check, body cap, rate limit)
  -> verify current Supabase user/session; never accept a model-supplied user ID
  -> construct bounded model request from minimized conversation + allowlisted tools
  -> model returns either a final answer or a proposed tool call
  -> validate tool name/schema/permission and enforce per-turn budgets
  -> execute read/safe cart operation, or save an address/order proposal only
  -> filter tool output before returning it to the model
  -> repeat within the bounded ReAct loop, or return final answer
  -> for sensitive proposals, render a separate trusted UI card
  -> human confirms/rejects through `/api/chat/confirm`; server rechecks identity,
     ownership, expiry and business state, then atomically records the result
```

Checkout remains the storefront's existing `/checkout` flow. No model tool may place an order, charge payment, or confirm its own proposal. Conversation persistence, if added, needs explicit retention rules and must not store credentials, raw private order/address results, or confirmation capabilities.

## Acceptance rule

Do not promote this integration to Production until all implementation items, live staging checks, production role/migration reviews, and security/dependency gates above are complete and recorded.

## Increment 2 — browser payload limits
Implemented streamed JSON body limits: tools 32 KiB, confirmations 4 KiB. Complete serialized responses are capped at 512 KiB. Oversized input returns 413, malformed JSON 400, oversized result 502. Byte counts are checked without trusting Content-Length. Boundary checks passed for valid, malformed, oversized streamed input and oversized output. Fix 1 was validated by the user in Preview. Rate limits, request deadlines and other roadmap gates remain pending.

## Increment 3 — distributed rate limiting (local, pending staging migration)
Shared PostgreSQL atomic counters now enforce 60 tool requests/customer/minute and 30 confirmation requests/customer/minute. Anonymous tool callers share the anonymous budget. Route-wide limits of 600 tools and 300 confirmations per minute run before authentication. Fixed-minute windows permit boundary bursts; these limits are initial staging defaults, not a substitute for perimeter DDoS controls. Rejections return 429 and Retry-After: 60. Counter-store outages fail closed with 503 RATE_LIMIT_UNAVAILABLE. Each subject uses one hashed row; review periodic deletion of inactive rows for retention. Direct MCP calls still require short-lived backend credentials; independent MCP ingress limiting, concurrency budgets and execution deadlines remain pending.
Before deploying: apply migrations/phase7-rate-limits.sql in isolated staging. The reviewed server role needs SELECT/INSERT/UPDATE; non-owner roles also need a narrowly scoped server-only RLS policy. Browser roles are explicitly revoked. Do not push/deploy this code before the table exists. No production migration has been performed.

Staging update: user reports phase7-rate-limits.sql applied successfully. Rate-limit code is ready for Preview deployment and live validation; production migration remains unapplied.
