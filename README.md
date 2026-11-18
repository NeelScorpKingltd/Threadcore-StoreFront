# ThreadCore

See [deployment instructions and code structure](DEPLOYMENT.md) for the private MCP integration, staging setup, migration order, environment variables and production gates.

ThreadCore is a full-stack, high-concurrency editorial apparel storefront engineered with Next.js 16, React 19, Tailwind CSS v4, Supabase Authentication, and Drizzle ORM on PostgreSQL.

---

## Features

- **Editorial Luxury Storefront**: Minimalist, high-end visual design with responsive category ribbon tabs, stock status indicators ("Sold Out", "Low Stock"), and instant quick-add/quantity adjustments directly from the collection grid.
- **Transactional Checkout & Concurrency Guards**:
  - Deterministic row locking (`SELECT ... FOR UPDATE ORDER BY id ASC`) across cart items to eliminate database deadlock risks.
  - Atomic conditional decrement (`inventory_count >= quantity`) preventing inventory overselling during simultaneous checkouts.
- **Atomic Order Cancellation**:
  - Atomic status transitions (`CONFIRMED` / `PROCESSING` &rarr; `CANCELLED`) ensuring stock is restored exactly once under concurrent cancellation requests.
  - Strict guards preventing cancellation of shipped or delivered orders.
- **Secure Authentication & Open Redirect Mitigation**:
  - Supabase SSR Auth with session refresh via Next.js proxy architecture (`proxy.ts`).
  - Strict internal path validation (`getSafeRedirectPath`) protecting auth callback redirects from external URL and protocol-relative injection attacks.
- **User Profile & Address Management**:
  - Multi-address management with default address selection.
  - Profile name and detail customization.
- **Currency Localization**:
  - All catalog and checkout prices displayed in Indian Rupees (`₹`).

---

## Tech Stack

- **Framework**: Next.js 16.4.6 (App Router, Turbopack, Server Actions)
- **UI & Styling**: React 19, Tailwind CSS v4, Lucide React icons
- **Database & ORM**: PostgreSQL (Supabase) via Drizzle ORM and `postgres.js`
- **Authentication**: Supabase SSR (`@supabase/ssr`)
- **Type Safety**: TypeScript 5 (Strict Mode)

---

## Project Structure

```text
Threadcore/
├── public/                 # Static assets and icons
├── scripts/
│   ├── test-mcp-auth.ts       # Offline authentication/security checks
│   ├── test-mcp-transport.ts  # Official SDK internal client harness
│   ├── test-domain-isolated.ts # Disposable local PostgreSQL regression suite
│   └── inspect-db-privileges.ts # Read-only database metadata inspection
├── migrations/              # Reviewed SQL; apply to staging before deployment
├── src/
│   ├── app/
│   │   ├── (auth)/         # Login and signup routes
│   │   ├── (shop)/         # Catalog, product details, cart, checkout, orders, profile
│   │   ├── actions/        # Next.js Server Actions (auth, cart, order, user)
│   │   ├── api/            # Route handlers (auth callback)
│   │   ├── globals.css     # Tailwind v4 configuration
│   │   └── layout.tsx      # Root layout
│   ├── components/         # UI components & interactive widgets
│   ├── lib/
│   │   ├── db/             # Drizzle client, schema, and seed scripts
│   │   ├── supabase/       # Supabase server/client/proxy helpers
│   │   ├── mcp-auth/       # Private server-only delegation/session boundary
│   │   └── utils.ts        # Formatting & styling utilities
│   ├── services/           # Domain services (catalog, cart, order, user)
│   └── proxy.ts            # Root Next.js session refresh proxy
├── .env.example            # Environment variable template
├── drizzle.config.ts       # Drizzle configuration
├── next.config.mjs         # Next.js configuration
├── package.json            # Dependencies & scripts
└── tsconfig.json           # TypeScript configuration
```

---

## Getting Started

### 1. Prerequisites

- Node.js 20+ (Node 22 or 26 recommended)
- npm 10+
- A Supabase project with PostgreSQL database

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env.local
```

Populate `.env.local` with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
DATABASE_URL=postgresql://postgres.your-project:your-password@aws-0-region.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.your-project:your-password@aws-0-region.pooler.supabase.com:5432/postgres
```

### 4. Database Preparation

Apply the reviewed migrations to an isolated staging database before deploying
the service changes. See [Phase 2](MCP_PHASE2.md) and [Phase 3](MCP_PHASE3.md) for
privilege checks, migration ordering and required server-only configuration.
These migrations are not run automatically. Do not seed or migrate production
without separate authorization.

Populate the demo apparel catalog:

```bash
npm run db:seed
```

### 5. Run Development Server

```bash
npm run dev
```

Visit https://threadcore-beta.vercel.app/ to view the storefront.

---

## Testing & Verification

- **Safe regression suites**:
  ```bash
  npm test
  ```
  Runs authentication checks offline and domain/concurrency checks in a disposable
  loopback-only PostgreSQL cluster. Tests do not load `.env.local` or connect to Supabase.
  The local PostgreSQL development dependency requires its platform installation scripts.

- **Run one suite**:
  ```bash
  npm run test:auth
  npm run test:mcp
  npm run test:domain
  ```
  The superseded database-mutating demo suites were removed after their useful
  checks were retained in these isolated suites.

- **Production Build**:
  ```bash
  npm run build
  ```
