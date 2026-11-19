# Current implementation and production readiness

Updated 2026-11-19.

## Implemented

- Existing storefront authentication, catalogue, carts, checkout, profiles, addresses, orders and transactional cancellation.
- Private stateless MCP transport with eight grouped tools and validated schemas.
- Verified Supabase identity and live session checks, short-lived signed delegation and exact-origin browser protection.
- Minimized model-visible cart data and separate UI/model result contracts.
- Bounded browser input/output, shared PostgreSQL rate counters, execution deadlines, per-process admission and database transaction timeouts.
- Durable cart mutation receipts and atomic proposal/decision processing for sensitive changes.
- Redacted request/tool/confirmation events, safe failure categories, source/history/artifact scanners and CI security checks.
- Verified remote PostgreSQL TLS with optional trusted CA configuration.
- A bounded OpenAI Responses agent with at most four model responses and three sequential tool calls per turn.
- Session-only BYOK, optional Preview staging key, streamed replies, Stop and polite failure behavior.
- Floating responsive chat bubble, product/cart cards, private account forms and automatic Accept/Decline confirmation popups.
- Cleanup of test suites, developer tester/playground, unused temporary schema output and their scripts/dependency references.

The source implementation is complete for this initial feature scope. Production release remains gated by the outstanding checks below.

## Evidence recorded so far

The user reported successful staging authentication, tool discovery, catalogue/cart responses and several mutation/confirmation checks. Vercel source/artifact scan output and security status checks were found and configured. Local agent/auth/domain/runtime suites passed during earlier development, before their requested removal.

The popup change was pushed as fa4ea19. Its deployment and full browser interaction checks have not been independently confirmed. The local /chat route returned HTTP 200 after adding the downloaded trusted Supabase certificate to ignored local configuration. This proves route loading only.

## Remaining work

1. Verify the deployed release commit and run the full real-provider chat flow on isolated staging. Include guests, login, product search, cart add/set/remove and all private reads.
2. Check desktop/mobile bubble layout, keyboard/focus behavior, Stop/errors, Accept/Decline, close/reopen, completed proposals and session cleanup on logout/account switching.
3. Complete security/integrity acceptance for cross-account isolation, expired/forged credentials, oversized inputs/results, rate limits, concurrent and replayed decisions, proposal expiry, changed order state and failures during mutations. Order cancellation acceptance was previously skipped.
4. Review aggregate Vercel/Supabase connection capacity, regional placement, observed latency and support for the configured function durations. Admission limits are per process.
5. Verify production server role, grants and RLS behavior. Review legacy data, back up the database and apply compatible migrations in order before deploying dependent code.
6. Prepare production origin, issuer, audience and signing keys independently. Keep staging database credentials and Preview bypass material scoped appropriately.
7. Resolve the project-wide Vercel build-command dependency. The last reported main branch lacks build:secure. Ensure the production release source supplies it or adjust the dashboard before a main deployment.
8. Verify operator log access and plan retention. Automated alerts were explicitly deferred and remain pending. A shared parent trace ID across internal requests is an optional improvement.
9. Re-run dependency and source/history/artifact checks against the actual release source. Historical clean results do not establish the current remote artifact's status.
10. Record the last good deployment, rollback procedure and production smoke checks, then authorize and perform the production rollout.

Production migrations, production role changes, automated alert delivery and production release have not been performed by these repository changes.

## Scope and limitations

English is the initial language. Chat history and visitor keys have no application persistence. Personal text typed directly into chat can reach OpenAI, so private forms are provided for account details. store:false disables stored Responses application state while provider account data policies still apply.

The model can request private read flows and hand off sensitive writes to the UI. The human fills private fields and decides the saved proposal. Confirmation IDs and private bodies stay outside model history. Checkout and payment use the existing storefront flow.

Test suites were removed at the user's request. CI retains static, dependency, scanner and build checks, but has no automated behavioral regression gate. Reintroducing focused tests is a future maintenance decision.
