# Chat

The floating storefront assistant, also opened through `/chat`, uses the existing MCP adapter and OpenAI Responses API. No new dependencies, database tables or conversation store are introduced. The initial model is `gpt-5.4-mini`; a server-only `THREADCORE_OPENAI_MODEL` setting can select another Responses/tool-compatible model, subject to separate testing and key access.

## Key and session handling

Visitors enter an OpenAI key into a password field. The key is kept in React memory, sent over HTTPS as `x-openai-key` to `/api/chat/message`, and used only for that request's calls to the fixed OpenAI API endpoint. It is never written to our database, cookies, localStorage/sessionStorage, model messages, tool arguments or application audit events. End session, navigation/refresh, tab close and account changes clear client state. In-flight requests retain references until they finish/cancel; JavaScript cannot guarantee memory zeroization. Do not configure platform/proxy tracing to collect request headers or bodies.

For Preview testing only, set `THREADCORE_OPENAI_STAGING_KEY` as a secret in Vercel Preview if you want the chat to work without visitors entering a key. This fallback is never used in Production. No key needs to be pasted into Git/chat documentation. Provider billing and data controls apply to the key owner's account.

Responses use `store:false` with no Conversations API or previous_response_id. This disables stored Responses application state, not all provider abuse-monitoring retention. See https://developers.openai.com/api/docs/guides/your-data . No raw provider error body is returned or logged.

## Flow and privacy

Chat text, public product data and minimized cart results can reach OpenAI. Users are told not to enter profile/address/order details in chat; use the private panel instead. Arbitrary user-entered personal text cannot be reliably classified/redacted automatically. Private form values and results never enter the message array or model requests. Profile/order/address reads execute under the current verified account and emit only a generic status to the model. Their data is rendered as text in the private panel.

The model can select all eight named tool flows. Product/cart operations execute through MCP. Address writes and cancellations are UI handoffs: the model cannot supply their private fields or create/confirm a proposal. The human enters the fields in the private panel; the existing `/api/chat/tools` creates a proposal and `/api/chat/confirm` renders/consumes its saved preview. After a proposal is created, an Accept/Decline modal opens with its saved preview. Closing the modal leaves the proposal pending. Use Review pending changes to reopen it. No confirmation IDs or capabilities are passed to the model. Checkout remains `/checkout`.

## Bounds and retries

Each chat request allows at most four model responses and three sequential tool calls, with no parallel tool execution. Each model response has max_output_tokens=1200; input/model-result bytes and streamed output are bounded. The chat loop has a 95-second deadline and the function declares maxDuration=120; verify plan support before enabling it. Direct MCP/database deadlines still apply. Global chat-message admission is 30/minute with existing subject limits and process concurrency limits. Model access failures show a polite fallback.

Cart request IDs are derived server-side from the turn UUID and canonical action arguments, protecting repeated calls within that turn. No automatic user-turn retry is performed. Stop/timeout does not undo an already-committed cart change: inspect the cart before sending a new change. Private proposal requests are also not retried automatically. Session history is limited to text user/assistant messages; private payloads, tool outputs and keys are not stored in history. No internal reasoning is exposed; only assistant text and brief tool activity stream to the browser.

## Staging validation

1. Deploy the release branch and open the stable staging `/chat` origin.
2. Enter a disposable, restricted-budget OpenAI test key, or configure the optional Preview-only key and redeploy.
3. Ask for products as a guest. Request a cart/private read and confirm login is required.
4. Sign in, reenter your key (account changes clear it), then test product search, cart reads and an explicit cart change.
5. Test private reads, then private address/order forms and saved confirmation popups. Review provider payload construction and log configuration to confirm private results stay out of model requests; never capture real headers.
6. End session and refresh: key/history/private results should be empty. Check logout/account switching and stopped requests for stale results.

Automated agent fixtures were removed during the requested cleanup. Live OpenAI and staging acceptance remain necessary. See MCP_PRODUCTION_READINESS.md for outstanding checks.

## Refined interface
The chat now uses a responsive editorial layout with prompt suggestions, a collapsible session-key control, tool activity, readable product/cart cards and a separate private workspace. Product/cart UI events are held only in client memory and explicitly excluded from the text history sent back to the model. Private data stays in the workspace; saved address/order cards can prefill a removal/cancellation form without copying UUIDs. Confirmation cards render saved previews and decisions as text. Product images are limited to the already allowed Unsplash host, and links target the fixed storefront product path. Keyboard focus and reduced-motion styles are included. No storage, provider, mutation or confirmation authorization behavior was added by this visual refinement.


## Current popup behavior
The confirmation popup is rendered using a native modal dialog. Private action forms automatically load pending proposals after creating a change. Accept and Decline send only the proposal ID and decision to the existing authenticated endpoint. Closing the popup leaves the decision pending. Resolved cards stay visible until the popup closes. The workspace holds private forms and read results, while approvals appear in the popup.

## Staging performance tracing
Preview Node.js functions register @vercel/otel through src/instrumentation.ts. Custom spans are enabled only for VERCEL_ENV=preview. Automatic fetch instrumentation and header-derived attributes are disabled. Explicit spans record fixed stage names, tool/permission/model names, LLM round numbers, numeric token counts and first-text durations. Exception contents, SQL, prompts, responses, credentials and private data are excluded from custom telemetry.

Stages include chat.turn (stream lifetime), chat.message/tools/confirm/mcp (handler work), mcp.connect, mcp.discover_tools, mcp.call_tool, mcp.http, auth.delegate, auth.supabase_get_user, db.session_check, db.rate_limit, db.transaction, db.customer_transaction, mcp.authorize and mcp.execute. Database transaction durations include connection acquisition and transaction setup/commit. The mcp.http span ends at response headers, while its parent connect/discovery/tool span includes SDK response consumption. LLM spans include the full provider stream and report input/output tokens and llm.first_text_ms when text exists. chat.first_text_ms measures from stream setup and is attached to the active span that produces the first text. A tool-only model round may have no first-text metric.

Trace context is injected only into the fixed same-origin MCP endpoint, linking internal functions. Vercel controls collection/sampling and platform metadata. An instrumentation file takes over SDK registration, so production has no application-registered tracing SDK in this configuration.

After Preview deployment, open the stable staging origin while signed in to Vercel, start a Toolbar tracing session, send a catalogue request, and use View Session Traces. Inspect /api/chat/message and expand the child spans. Compare mcp.connect/discover/auth/database durations with llm.response rounds and first-text metrics. Repeat once warm, then stop the session. Session tracing uses its plan allowance. No always-on paid tracing configuration or third-party exporter is enabled by this code.

The previous observed staging message requests took 47.54s and 39.64s. Those totals do not establish which stage is slow. Capture new detailed traces before changing authentication, connection handling or model settings. Product-card filtering and INR response corrections are separate pending fixes.

## Tool failure diagnostics
Preview mcp.call_tool spans now mark MCP isError results as errors, even when HTTP succeeds. Attributes include tool.attempt, tool.error.category and tool.error.fields. The chat_tool event also records the attempt number, fixed category and recognized schema fields. Categories are validation, authentication, authorization, operation, protocol and transport. Unknown protocol errors remain protocol. Validation field extraction accepts only a fixed schema-name allowlist from SDK JSON issue paths; malformed or unavailable paths are omitted. Original messages, issue values, arguments and results are excluded from diagnostic output. Thrown client failures are categorized as transport in the audit event and preserve existing failure behavior.

These diagnostics do not introduce retries or alter the agent's three-call budget. Reproduce the trousers request in a new tracing session and inspect failed mcp.call_tool spans and matching chat_tool events before selecting a behavioral fix. Product selection/currency and setup latency optimizations remain pending.
