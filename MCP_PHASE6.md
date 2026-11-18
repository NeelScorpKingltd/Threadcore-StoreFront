# Phase 6 — embedded-chat integration preparation

Cleanup follow-up: the unmounted ChatIntegrationHarness was removed after the standalone interactive playground superseded it. McpConfirmationCard remains the future chat's reusable trusted card. See DEPLOYMENT.md for the current structure and successful build verification; this phase note retains historical context.

Follow-up: the unfinished confirmation implementation described below has now been corrected and covered by local integrity tests; see MCP_PHASE5.md. Live staging verification remains outstanding.

Implemented adapter and harness locally. No LLM provider, conversational application, migration or deployment was added.

`withChatTools(request, work)` creates a request-local official SDK client and obtains fresh server-only delegation for each transport request. It checks browser origin/session through Phase 3, uses only the configured MCP endpoint, disables redirects/caching and never forwards browser headers wholesale. Clients close after use; no customer context is shared globally.

The same-origin JSON POST `/api/chat/tools` accepts either `{ operation: "list" }` or `{ operation: "call", tool, arguments }`. Its strict outer schema restricts tool names; MCP schemas validate operation arguments. Caller-provided identity cannot select the service customer. The endpoint authenticates/origin-checks before processing the body. Future model orchestration should call the server adapter, not expose transport credentials.

Result contract: kind (tool_result, error or login_required), tool, uiResult, modelResult, persist=false, fixed loginPath=/login and checkoutPath=/checkout, and refreshConfirmations for sensitive proposals. Address/order bodies are excluded from modelResult by default; uiResult is for the authenticated browser only. Do not persist the whole response as conversation history. This code introduces no customer-data logs or history store. Authentication failures outside tool execution use the Phase 3 sanitized error JSON with HTTP status; the UI must handle 401 independently of the tool-result envelope.

Trusted confirmations remain separate: POST `/api/chat/confirm` with operation=list fetches private cards; Confirm/Reject submits only the pending ID and Boolean, never replacement action arguments. Pending IDs do not belong in model context. The backend revalidates current login on each request. The optional ChatIntegrationHarness component displays catalogue/cart responses, refreshes confirmation cards and links to storefront checkout. It clears displayed customer data when Supabase reports an auth-state change. It is deliberately not mounted on the production storefront.

## Remaining acceptance work

Phase 5 was only partially completed before this phase. Its pending-action migration is still unapplied; confirmation expiry/replay/concurrency, account-switch tampering and crash-recovery tests are not yet established. Therefore confirmed cancellation/address execution has **not** been demonstrated end to end, and Phase 6's full acceptance criteria remain incomplete. Do not roll this out until those checks and isolated staging verification pass. The optional UI is an integration harness, not a production confirmation design.

The existing build worker failure and live Supabase TLS/privilege-verification limitation remain. No production data was accessed. Necessary migration history and regression suites were retained; redundant legacy suites were already removed. No newly generated temporary artifact required deletion. Historical phase notes are retained as verification evidence rather than deleted.
