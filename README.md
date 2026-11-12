# ThreadCore

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
│   ├── test-concurrency-and-security.ts  # Concurrency & security test suite
│   └── verify-invariants.ts              # Business rule verification suite
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

### 4. Database Seeding

Populate the demo apparel catalog:

```bash
npm run db:seed
```

### 5. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the storefront.

---

## Testing & Verification

- **Security & Concurrency Test Suite**:
  ```bash
  npx tsx --env-file=.env.local scripts/test-concurrency-and-security.ts
  ```
  Runs 29 automated checks verifying safe auth redirects, concurrent checkout race prevention, and atomic cancellation stock integrity.

- **Invariant Verification Suite**:
  ```bash
  npx tsx --env-file=.env.local scripts/verify-invariants.ts
  ```
  Validates catalog seeding, sold-out product restrictions, and order lifecycle invariants.

- **Production Build**:
  ```bash
  npm run build
  ```
