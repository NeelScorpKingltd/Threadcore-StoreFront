# Phase 4 — private MCP transport and tools

Implemented locally 2026-11-17. Phase 5 has not started. No deployment, production migration, OAuth change or LLM integration was performed.

## Transport

`/api/mcp` runs in the Node.js runtime, force-dynamic, with a 30-second Vercel duration. The official TypeScript `@modelcontextprotocol/sdk` is pinned to 1.32.2 and Zod to 4.6.7. The tested SDK protocol is 2025-11-25; SDK-supported protocol negotiation is retained. This uses the SDK's WebStandardStreamableHTTPServerTransport directly with stateless sessions and JSON responses. A new server/transport is created for each request, its completed response is buffered, and both are closed. No process-local user/session state, SSE session store or redundant REST layer is added.

Every request, including initialization/discovery, must pass the Phase 3 private credential boundary. Every tool invocation separately verifies its operation permission and current session. Only a verified principal selects the service customer ID. Cookies alone cannot authenticate this endpoint. The existing proxy exemption prevents HTML login redirects; the route itself enforces authentication. GET/DELETE/OPTIONS return authenticated method errors; POST is supported. No CORS access is enabled. Origin headers, when present, must match the request's deployment origin, which the authentication boundary verifies against explicit configuration.

Request bodies are limited to 64 KiB by the SDK while reading the stream. Tool results are capped at 128 KiB, use structuredContent plus equivalent JSON text, and carry a fixed `/checkout` handoff. All endpoint responses are uncached; known authentication failures use 401/403, unavailable authentication uses 503, and tool failures return sanitized MCP error results. No database errors or credentials enter results. Distributed rate limiting/redacted audits remain Phase 7 requirements.

## Tool contract

All schemas reject extra fields, including caller-supplied user IDs and redirect URLs. UUIDs, bounded integers, strings and discriminated operation schemas are validated before service calls.

| Tool | Operations / fields | Permission |
| --- | --- | --- |
| catalog_read | list: optional category/search/inStockOnly, limit 1–50 (default 20), offset 0–100000; details: id; sku: sku | catalog:read; anonymous allowed |
| cart_read | no arguments; own cart and totals | cart:read |
| cart_write | add: productId, quantity 1–99, requestId; set: cartItemId, quantity 0–99, requestId; remove: cartItemId, requestId | cart:write |
| profile_read | no arguments; displayName only, capped at 100 characters | profile:read |
| addresses_read | no arguments; own saved addresses | addresses:read |
| addresses_write | add: street/city/state/postalCode, country default India, isDefault default false; delete: addressId | addresses:propose |
| orders_read | list: bounded limit/offset; details: orderId | orders:read |
| orders_write | cancel: orderId, reason | orders:propose |

Sensitive proposal tools deliberately return `CONFIRMATION_UNAVAILABLE` and `executed: false` at this phase. They do not persist proposals or change data: durable proposals and trusted UI execution belong to Phase 5. Tool descriptions make this limitation explicit. Cart changes execute immediately after login, through Phase 2's durable idempotency services; retain the same requestId for retries of one intent.

No clear-cart, profile-write, order-creation, payment or checkout tool exists. Catalogue descriptions and all other stored text remain untrusted data: the server instructions and result envelope explicitly identify that boundary. Stored content cannot change tool permissions or authorize execution.

## Internal client and integration

`npm run test:mcp` is the minimal internal client harness. It uses the official SDK Client and StreamableHTTPClientTransport against the same handler through a local fetch adapter, without a web server or LLM. Its service fixtures contain no real customer data and do not access the database. The harness demonstrates initialization, all eight tools in discovery, anonymous catalogue reads, authenticated cart/profile use, schema rejection, per-invocation authentication, logout isolation and sensitive-write blocking.

The future browser backend must issue delegation from its current verified request using Phase 3, send the body with `delegation.transportRequest(body)` to the fixed endpoint, and never expose transport headers or tokens to the model. Reissue short-lived delegation as necessary; do not cache user context across requests. This phase does not create a public token issuer or a browser chat endpoint. Live SDK/Supabase staging verification still requires the Phase 2/3 migrations and environment configuration.

## Verification / cleanup

- Official SDK initialization/discovery and permitted execution harness passed.
- Retained Phase 3 authentication and Phase 2 domain regression suites; npm test includes all three. No temporary test artifacts or redundant prior-phase scripts were introduced.
- Type checking and lint were checked. The existing Turbopack CSS worker failure from earlier phases remains an unresolved production-build limitation; no build configuration changes are included here.
- Supabase production data and deployment settings were not changed. Live role/RLS verification and migration application remain pending; never deploy these service paths against an unmigrated database.
- Phase 5 must replace unavailable proposals with persisted, expiring, user-bound pending actions and trusted confirmations before sensitive writes can run.
