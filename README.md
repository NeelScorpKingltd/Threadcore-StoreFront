# ThreadCore

ThreadCore is a Next.js 16 / React 19 apparel storefront with Supabase Authentication, PostgreSQL through Drizzle, a private MCP endpoint and an OpenAI shopping assistant.

Live storefront: [threadcore-beta.vercel.app](https://threadcore-beta.vercel.app/).

## Technology stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Application | Next.js 16 App Router, React 19, TypeScript | Storefront pages, interactive components, Server Actions and API routes |
| Styling | Tailwind CSS 4, CSS modules, Lucide React | Responsive storefront, chat layouts and icons |
| Authentication | Supabase Auth and Supabase SSR | Customer sign-up/sign-in, cookies and session refresh |
| Database | Supabase PostgreSQL, Drizzle ORM, postgres.js | Typed queries, relational storage and transactional business logic |
| AI assistant | OpenAI Responses API | Streamed English responses and a bounded tool-use loop with session-only BYOK |
| Tool integration | Official Model Context Protocol TypeScript SDK | Private MCP transport and eight shopping/account tools |
| Validation and credentials | Zod, jose | Input schemas and signed, short-lived delegated MCP credentials |
| Observability | OpenTelemetry, Vercel OTel and runtime logs | Preview tracing and redacted operational events |
| Hosting and delivery | Vercel, GitHub Actions, Node.js 22 and npm | Deployments, dependency installation and CI checks |
| Quality checks | ESLint, TypeScript, npm audit and repository security scanners | Static checks, dependency audit and source/history/build artifact scanning |

## Functional capabilities

ThreadCore lets customers discover apparel, manage a signed-in shopping bag, place orders and manage their account through the storefront or a shopping assistant.

- Catalogue filtering, product details, stock indicators and quick cart controls.
- Signed-in carts, checkout, order history and cancellation, profile editing and saved addresses. Checkout locks inventory and validates stock transactionally. Cancellation restores inventory once.
- Cart quantity updates, removal, synchronized badge/snapshot updates and persisted customer carts. Guest cart actions redirect to sign-in and return to the originating page after successful authentication.
- Consistent INR prices across catalogue, product, cart and chat views, formatted from stored paise amounts.
- Supabase SSR authentication, session refresh and validated internal redirects.
- A floating chat bubble across storefront pages. It opens to approximately one-third of desktop width and nearly full width on phones. Collapse preserves the current in-memory session. Visiting /chat opens the assistant over the collection.
- Streamed English chat, suggestions, activity indicators, Stop, product/cart cards and private account forms inside the conversation.
- Production BYOK through a password field. Keys and conversation state stay in client memory for the current mounted session. Preview can use a server-only staging key.
- Eight MCP tools for catalogue, cart, profile, addresses and orders. Guest chat can browse products. Customer data and mutations require verified login.
- Address additions/edits/removals and order cancellations use saved proposals. A modal displays the saved preview with Accept/Decline. Closing it leaves the proposal pending. Pending proposals can be reopened.
- Product and minimized cart data can reach the model. Private account results and proposal capabilities stay in the authenticated UI flow.

### Chat agent

The shopping assistant combines conversation with live storefront tools. Guests can discover products; signed-in customers can read and change their cart, view private account information, manage saved addresses and select an active order for cancellation. Product cards show selected retrieved products, cart cards refresh after successful changes, and sensitive workflows open private forms followed by confirmation popups.

#### Implementation stack and agent flow

- **Framework and UI** — Next.js App Router API routes with a React/TypeScript chat bubble, streamed text, tool activity indicators, result cards and Stop controls.
- **Model integration** — Direct server-side HTTP calls to the OpenAI Responses API, using `gpt-5.4-mini` by default and an optional server-configured model override.
- **Agent orchestration** — A custom bounded tool-use loop in TypeScript, following a ReAct-style model → action → observation cycle. The model selects a tool, the backend validates and executes it, and permitted results feed the next model response. Internal reasoning is not displayed. No separate agent orchestration framework is used.
- **Tool layer** — The official MCP TypeScript SDK connects on demand to the private `/api/mcp` endpoint. Shared Zod schemas define and validate the eight MCP tools. A separate `show_products` presentation function selects cards only from products retrieved during the current turn.
- **State and streaming** — Conversation and BYOK state live in browser memory. The server reads OpenAI's event stream and sends newline-delimited JSON events to the UI. Each turn allows at most four model responses and three tool-selection rounds; additional cart refresh or private-selection reads may occur within those rounds.

```text
Chat bubble → /api/chat/message → OpenAI Responses API
                                     ↓ tool selection
                               Validate arguments
                                     ↓
                        Private MCP adapter → /api/mcp
                                     ↓
                         Shared services → PostgreSQL
                                     ↓
                   Permitted observation → next model response

Sensitive action → private UI form → saved proposal → confirmation popup
                 → /api/chat/confirm → authorized execution
```

#### Security and privacy controls

- **Server-enforced authorization** — Supabase identity/session checks, customer ownership checks and scoped, signed MCP delegation protect private operations. The model cannot choose the acting customer or grant itself permissions.
- **Human approval for sensitive changes** — Address changes and order cancellations are handed to private UI forms. The backend stores a proposal and requires an authenticated browser decision, checking ownership, expiry and current business state before execution.
- **Separated model and UI results** — Product and minimized cart data can be sent to the model. Structured profile, address, order and confirmation data remain in the private UI path. Free-text messages still reach OpenAI, so visitors should avoid entering sensitive account details in chat.
- **Session-only keys** — Production requires each visitor's API key, held in browser memory and sent to the backend for model requests. It is not saved to browser storage or the application database. Provider requests use `store: false`; this does not independently guarantee zero retention by the provider.
- **Validated execution** — Model tool names and arguments are checked against allowlists and schemas. Cart mutation identifiers are generated by the backend, with database receipts protecting retries from duplicate execution. Checkout and payment are outside the agent's tool capabilities.
- **Bounded resource use** — Rate limits, admission limits, deadlines, message/stream size caps and model/tool round limits constrain each request. Operational logging redacts sensitive data, and explicit Preview spans help identify latency.
- **Prompt-level guidance** — Instructions direct the model to treat tool text as untrusted, use live tools for facts and avoid requesting private details. These instructions supplement the server-side controls; they do not provide an authorization boundary.

#### Source map

| Component | Location |
| --- | --- |
| Agent prompt | [`src/lib/chat/agent.ts`](src/lib/chat/agent.ts), `instructions` constant |
| Model streaming and agent loop | [`src/lib/chat/agent.ts`](src/lib/chat/agent.ts), `modelResponse` and `runAgent` |
| Chat API entry point | [`src/app/api/chat/message/route.ts`](src/app/api/chat/message/route.ts) |
| MCP client and model/UI result separation | [`src/lib/chat/adapter.ts`](src/lib/chat/adapter.ts) |
| Tool schemas and MCP server | [`src/lib/mcp/tool-schemas.ts`](src/lib/mcp/tool-schemas.ts), [`src/lib/mcp/server.ts`](src/lib/mcp/server.ts) |
| Identity and delegation checks | [`src/lib/mcp-auth/core.ts`](src/lib/mcp-auth/core.ts) |
| Confirmation endpoint | [`src/app/api/chat/confirm/route.ts`](src/app/api/chat/confirm/route.ts) |
| Chat interface | [`src/components/ChatBubble.tsx`](src/components/ChatBubble.tsx), [`src/components/StoreChat.tsx`](src/components/StoreChat.tsx) |

## Non-functional capabilities

| Area | Implemented capability |
| --- | --- |
| Access control | Server-side user/session verification, customer ownership checks, exact-origin checks and scoped, short-lived MCP credentials |
| Privacy | Session-only API keys and conversation state in browser memory; private profile/address/order results stay in UI flows; OpenAI requests use `store: false` |
| Confirmation safety | Durable address/order-cancellation proposals with explicit browser approval, ownership checks, expiry and stale-state validation |
| Data integrity | Transactions, inventory row locks, bounded quantities, database constraints and mutation receipts to prevent duplicate execution |
| Resource protection | Shared database-backed rate limits, per-process admission limits, bounded model/tool loops, request/response size caps and execution/SQL deadlines |
| Transport security | Remote database certificate verification with optional trusted CA configuration; deployment secrets supplied through environment configuration |
| Performance | Lazy MCP connection setup, local argument validation, bounded/paginated reads and streaming responses |
| Observability | Redacted operational events and Preview-only spans for chat, LLM, MCP, authentication and database work |
| Maintainability | Shared domain services and tool schemas, typed application code, reviewed SQL migrations and automated CI checks |
| Responsive interaction | Collapsible desktop/mobile chat, loading indicators, Stop controls and confirmation dialogs |

### Current scope and limits

- Checkout creates orders and updates stock. Online payment processing is not integrated.
- Chat supports English and session history only. Refreshing or ending the mounted session clears the in-memory key and conversation.
- OpenAI receives the messages the visitor submits, alongside permitted product/cart context. Private forms keep their structured account data out of model context; visitors should avoid typing sensitive details into chat.
- Application tracing is enabled for Preview deployments. Log retention and access depend on hosting configuration; automated application alert delivery is deferred.
- Automated behavioral regression suites are absent. Accessibility, production acceptance and broader capacity testing require explicit validation; no uptime or throughput guarantee is claimed.

## Implementation

Browser -> /api/chat/message -> bounded OpenAI Responses loop -> private MCP adapter -> /api/mcp -> shared domain services -> PostgreSQL.

Private forms call /api/chat/tools. Sensitive changes create durable proposals. Only a browser decision through /api/chat/confirm can execute them after ownership, expiry and business-state checks.

The backend validates tool schemas, verifies Supabase user/session state, signs short-lived delegated credentials and checks exact origins. Streamed request/response caps, shared rate limits, process admission limits, deadlines, SQL timeouts, mutation receipts and redacted operational events are implemented. Preview-only tracing links LLM/MCP/authentication/database work. Shared schemas validate arguments locally and MCP connects on demand.

## Code structure

- src/app/(shop) contains collection, product, cart, checkout, orders, profile and /chat routes.
- src/app/(auth), src/app/actions and src/proxy.ts contain authentication pages, storefront mutations and session refresh.
- src/app/api contains the Supabase callback, private MCP endpoint and chat message/tools/confirm routes.
- src/components contains storefront controls, ChatBubble, StoreChat, ChatResult and McpConfirmationCard.
- src/lib/chat contains the OpenAI loop, adapter, budgets, rate limiting and audit helpers.
- src/lib/mcp and src/lib/mcp-auth contain tools, transport, pending actions and the delegation boundary.
- src/lib/db, src/lib/domain and src/services contain schema, database configuration, validation and shared transactional business logic.
- migrations contains reviewed SQL upgrades and privilege inspection.
- scripts contains security scans, a read-only database privilege utility and an alert threshold evaluator.
- .github/workflows/security.yml runs security scans, dependency audit, lint, TypeScript and a secure build.

## Local development

Use Node 22 and npm. Run npm ci, copy .env.example to .env.local and configure the correct isolated database/auth project and exact local origin. Configure the trusted Supabase CA with THREADCORE_DB_CA_PEM when required. Review the SQL in migrations/ and apply it to an isolated staging database before deploying code that requires it. The build does not apply migrations.

Run npm run dev. If the local Turbopack CSS worker fails, use npm run dev -- --webpack. Enter your own OpenAI key in the assistant.

## Verification and cleanup

Run npm run lint, npx tsc --noEmit --incremental false, npm run security:source, npm run security:history and npm run build:secure. For the local webpack workaround run npm run build -- --webpack followed by npm run security:artifacts.

Automated behavioral regression suites are currently absent. Security scans are heuristic and require review alongside live staging acceptance.

## Repository contents

The repository includes application source, configuration templates, reviewed migration SQL, security utilities and CI configuration.

Detailed operational runbooks, release records, planning documents, local environment values, certificates and database backups are maintained outside Git tracking. Maintainers should consult their local deployment and security runbooks before changing production.
