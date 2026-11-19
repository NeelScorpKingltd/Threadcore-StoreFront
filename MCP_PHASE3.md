> Historical phase instructions. Current features and remaining work are recorded in README.md and MCP_PRODUCTION_READINESS.md. Test and playground commands referenced below were retired in the 2026-11-19 cleanup.

# Phase 3 — private authentication boundary

Implemented locally on 2026-11-17. Phase 4 has not started. Supabase OAuth Server remains unchanged/disabled by requirement. No live migrations, deployment, real signing keys, token-minting HTTP route, MCP handler or chat application were created.

## Identity and credentials

The future embedded UI sends a same-origin JSON POST to its own backend. That backend calls `privateMcpAuthentication().delegateFromBrowser(request)`. The issuer reads the current Supabase session only to obtain an access token, authenticates that exact token through Supabase `getUser(token)`, compares the verified customer to the token claims, and checks that the matching Supabase session still exists and has not reached `not_after`. Supabase anonymous-auth users are not granted customer permissions. Model arguments and request bodies never select the customer or permissions.

The server-only issuer signs a dedicated HS256 JWT through pinned jose 6.2.17. It includes an exact environment-specific issuer/audience, explicit JWT type, configured key ID, issued/not-before/expiry times, random request identifier, context kind and allowed permissions. Customer credentials bind the customer ID, session ID and hash of the exact verified Supabase access token. Anonymous credentials contain only catalogue-read permission and an anonymous subject. Expiry is at most 30 seconds, bounded by the underlying session JWT expiry, with no clock tolerance.

Credentials and the Supabase session proof travel only between the chat backend and the private MCP endpoint. The `InternalDelegation` object stores headers in private fields and serializes as `{ redacted: true }`. Its `transportRequest(body)` uses only the configured `/api/mcp` URL, disables redirects and caching, and returns a server-side Request. Never send that Request, its headers, or the delegation object to a client, tool result, conversation, log or model. `transportHeaders()` exists for internal SDK integration; callers must retain the same fixed target and redirect prohibition. Do not log HTTP headers when debugging.

On **every tool invocation**, the future MCP handler must call `authenticateInvocation(request, operationPermission)`, even if discovery already authenticated the HTTP request or hid unavailable tools. This verifies signature/type/key, exact issuer and scalar audience, expiry/lifetime, context and permitted scope. For customers, it again authenticates the hidden session proof through Supabase, checks live session existence, compares customer/session/token binding and rechecks expiry after remote validation. It returns only the verified principal. The tool handler passes `principal.userId` to shared services; a model-supplied user ID must never reach them. Do not cache a principal for subsequent requests or batch tool executions.

| Permission | Meaning |
| --- | --- |
| catalog:read | Public catalogue list/search/details |
| cart:read / cart:write | Own cart reads/add/set/remove |
| profile:read | Own display name only |
| addresses:read / addresses:propose | Own saved addresses; propose sensitive changes |
| orders:read / orders:propose | Own order list/details; propose cancellation |

No checkout, payment, order-creation, clear-cart, profile-write, approval or sensitive direct-write permission exists. Address/order proposal permissions do not authorize execution; trusted confirmation will be implemented in Phase 5.

## Browser protection and HTTP behavior

`assertTrustedBrowserMutation` requires POST, application/json, the exact configured Origin, the same request URL origin, and Sec-Fetch-Site=same-origin when present. It rejects missing/null/cross-site origins and simple form submissions. The trusted origin is configured explicitly, never derived from Host/X-Forwarded-Host. Future browser mutation/confirmation handlers must use this guard plus current-session authentication; confirmation handlers can use `requireBrowserCustomer(request)`. The guard is not a replacement for ownership or confirmation.

The proxy now lets the exact `/api/mcp` and `/api/chat` family authenticate within their handlers instead of redirecting to an HTML login page. There are no such route handlers yet, so those paths currently remain unimplemented. Existing storefront navigation/session refresh is preserved. Future handlers must not rely on proxy authentication. The error helper returns sanitized 401/403/503 JSON with no-store/private caching headers and a private Bearer challenge on 401. CORS is not enabled.

## Logout, account switching and failure behavior

- Missing current session can create only an anonymous catalogue context. A present invalid session fails closed; it is not silently downgraded.
- A delegation alone cannot run a customer operation: the exact verified Supabase session proof is also required. Another user's token, another session, or a refreshed access token cannot be substituted. Reissue delegation from the current browser request after refresh/account switching.
- Supabase documents that access JWTs can remain valid after sign-out. The live-session function closes that gap: after Supabase deletes a session, the next protected verification rejects it even before JWT expiry. This includes logout elsewhere affecting that session. Session timeboxing via not_after is also checked. A request already authorized immediately before a concurrent logout may finish; this does not undo committed mutations.
- Browser logout clears cookies, so later UI requests cannot issue customer context. Existing Supabase signOut behavior is unchanged. If sign-out fails upstream, do not claim revocation succeeded.
- Authentication/session-store outages fail closed with AUTH_UNAVAILABLE; invalid credentials produce 401, and insufficient permissions/CSRF produce 403. No credentials, database exceptions or customer data are included in errors. No session/token-verification cache was introduced.

Supabase references: [getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [sign-out JWT behavior](https://supabase.com/docs/guides/auth/signout), [session IDs and lifecycle](https://supabase.com/docs/guides/auth/sessions).

## Configuration and rotation

Set only on the server, separately for each environment:

- THREADCORE_APP_ORIGIN — exact HTTPS storefront origin without trailing slash. Local HTTP localhost/127.0.0.1 is allowed only outside production.
- THREADCORE_MCP_ISSUER — exact environment-specific HTTPS/URN issuer.
- THREADCORE_MCP_AUDIENCE — exact environment-specific HTTPS/URN audience.
- THREADCORE_MCP_SIGNING_KID — active key ID.
- THREADCORE_MCP_SIGNING_KEYS — JSON object mapping up to three key IDs to cryptographically random 32-byte base64url secrets, generated/stored through a secret manager. It is never NEXT_PUBLIC and must never be committed.

Existing Supabase public URL/anon-or-publishable key and server DATABASE_URL remain required. No service-role key is added. Missing/malformed configuration fails closed without printing its values. Signing/configuration modules have server-only guards; none is a Server Action or public route.

Rotation: add a newly generated key under a new ID while retaining the previous key; switch the active ID and deploy backend/verifier together. After every old issuer instance has drained and at least 30 seconds have elapsed since its last issuance, remove the old verification key and redeploy. Reissue credentials per operation rather than persisting them. For compromise, remove the old key immediately and reject outstanding credentials. Never share keys, issuer/audience identifiers or production data access with previews.

## Required staging migration

Apply Phase 2's reviewed migration first, then `migrations/phase3-session-verification.sql`, **only to isolated staging at this stage**. This has not been applied to Supabase. The new function uses SECURITY DEFINER with an empty search_path and a fixed schema-qualified query to return one Boolean for a matching auth.sessions user/session pair and its not_after expiry. It does not expose raw session rows or tokens. The migration owner needs reviewed SELECT access to auth.sessions, including id, user_id and not_after; verify the deployed Supabase auth schema before application.

PUBLIC, anon and authenticated execution are explicitly revoked. If the application connection role is not the function owner, grant EXECUTE only to the reviewed server role after inspecting the role hierarchy. Do not grant the application role raw auth.sessions access and do not grant the function to browser roles. Verify no other default/member role grants expose it. Actual deployed privileges remain unverified because the earlier metadata inspection failed certificate-chain verification; TLS verification has not been disabled. Missing function/privilege fails closed for protected MCP use. Anonymous catalogue delegation does not need a session-table query.

Rollback: remove/disable future chat/MCP entry points before restoring prior code; keep Phase 2 receipt data. Revoke application execution on the session function when it is no longer used. Any eventual function drop or production migration requires its own reviewed deployment action. No production action is included here.

## Verification and cleanup

- Authentication suite: 14 offline groups cover anonymous/private permissions, verified identity independent of request body, fresh session checks, forged/expired/oversized/unsigned/wrong-key tokens, exact audience/issuer, invalid claim lifetimes, hidden permissions, cross-user/session/token substitutions, session deletion/logout and account switching, invalid cookies, outages, Supabase anonymous users, expiry during verification, CSRF, key rotation, configuration validation, secret-safe serialization/errors and fixed-target redirect-free request construction. Pure redirect/config checks were migrated from the old suite.
- Domain suite: 16 groups use isolated local PostgreSQL. New coverage applies the actual Phase 3 migration against a minimal auth.sessions fixture, checks customer/session pairing, expiry/deletion, browser-role denial and restricted server execution without direct auth.sessions reads. Prior domain/concurrency/retry/rollback checks remain.
- Type checking and lint pass. Pre-existing unused imports/bindings and the empty InputProps interface were cleaned without changing component interfaces/behavior.
- Production build still fails at the existing Turbopack globals.css CSS-worker/process panic. A successful production build is not established.
- Removed redundant scripts/test-concurrency-and-security.ts and scripts/verify-invariants.ts after retaining meaningful coverage in the isolated suites. Removed their obsolete npm commands and updated README instructions. The old suites' demo-seed count assumption is intentionally not a regression requirement.
- Retained migrations, the read-only privilege inspection utility, active regression tests and phase notes: these are needed for staging/integrity verification. Earlier phase notes remain historical snapshots; their legacy test/lint references are superseded here. Existing local credentials, private user documents, dependencies and active development-server files were not deleted.
- No live Supabase verification/migration, signing-secret provisioning, OAuth change, chat UI, MCP SDK transport, LLM integration or production deployment was performed. Staging rollout and live Supabase-session verification are still required.
