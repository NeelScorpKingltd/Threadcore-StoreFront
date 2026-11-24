# ThreadCore

ThreadCore is a Next.js 16 / React 19 apparel storefront with Supabase Authentication, PostgreSQL through Drizzle, a private MCP endpoint and an OpenAI shopping assistant.

Live storefront: [threadcore-beta.vercel.app](https://threadcore-beta.vercel.app/).

## Current features

- Catalogue filtering, product details, stock indicators and quick cart controls.
- Signed-in carts, checkout, order history and cancellation, profile editing and saved addresses. Checkout locks inventory and validates stock transactionally. Cancellation restores inventory once.
- Supabase SSR authentication, session refresh and validated internal redirects.
- A floating chat bubble across storefront pages. It opens to approximately one-third of desktop width and nearly full width on phones. Collapse preserves the current in-memory session. Visiting /chat opens the assistant over the collection.
- Streamed English chat, suggestions, activity indicators, Stop, product/cart cards and private account forms inside the conversation.
- Production BYOK through a password field. Keys and conversation state stay in client memory for the current mounted session. Preview can use a server-only staging key.
- Eight MCP tools for catalogue, cart, profile, addresses and orders. Guest chat can browse products. Customer data and mutations require verified login.
- Address additions/edits/removals and order cancellations use saved proposals. A modal displays the saved preview with Accept/Decline. Closing it leaves the proposal pending. Pending proposals can be reopened.
- Product and minimized cart data can reach the model. Private account results and proposal capabilities stay in the authenticated UI flow.

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
