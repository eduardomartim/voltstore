# VoltStore

A full-stack e-commerce application for a fictional tech-accessories store, built with Next.js, Supabase and Stripe. The storefront is branded **Voltline**.

This is a portfolio project. Products are fictional, payments run in **Stripe test mode**, and nothing is sold or shipped. The goal was not a large feature set. It was to get the parts of e-commerce that are easy to get wrong right, and to prove it with tests:

- who can read or change which data (enforced by PostgreSQL Row Level Security, not only by the UI)
- what a customer pays (prices always come from the database, never from the browser)
- when an order counts as paid (only when a verified Stripe webhook says so, processed exactly once)
- that stock can't be oversold or left stuck in abandoned checkouts

---

## Overview

Customers browse a catalog, build a cart, create an account and pay through Stripe Checkout. Payment confirmation arrives asynchronously through a Stripe webhook. That webhook is the single source of truth: it moves the order to `paid` and triggers the confirmation email. Administrators manage products, stock and the order fulfilment lifecycle from a protected admin area.

Most business rules that must never be violated live in PostgreSQL itself (transactions, row locks, constraints, triggers and RLS policies), so they hold no matter which code path touches the data.

## Key features

**Storefront**
- Product catalog with search, category filters and sorting
- Product pages with live stock status; out-of-stock products can't be added to the cart
- Cart: add, remove, change quantity, clear. Quantities are limited by stock and a per-item maximum.
- Responsive layout, plus loading, empty, error and not-found states

**Accounts** (Supabase Auth)
- Sign up with email confirmation, sign in, sign out, persistent cookie sessions
- Password recovery and reset by email
- Profile page, order history and order details, limited to the customer's own data

**Checkout and payments** (Stripe)
- A Stripe Checkout Session is created on the server from database prices, in BRL
- Stock is reserved atomically when the order is created and released if checkout expires, fails or can't be started
- Webhook-driven payment confirmation with signature verification and idempotent processing
- A success page that shows the order state written by the webhook; arriving on the page doesn't confirm payment

**Orders and inventory**
- Orders store snapshots of product name and unit price, so later price changes never alter past orders
- An order lifecycle enforced by the database: `pending → paid → processing → shipped → delivered`, with `cancelled` allowed before shipping
- Cancelling an order puts its stock back automatically

**Admin area** (role `admin`)
- Dashboard: revenue from paid orders, orders to fulfil, orders awaiting payment, low-stock list
- Create and edit products, activate or deactivate them, adjust stock
- Browse and filter orders and advance their status; the customer is notified by email

**Transactional email** (Resend)
- Welcome email after the address is confirmed
- Order confirmation when payment is received, payment-failed notice, and status updates
- Without an API key, emails are logged to the server console and reported as *not sent*

---

## Architecture

A modular monolith on the Next.js App Router. There are no separate backend services: server-side logic runs in Server Components, Server Actions and one API route, and the database enforces the critical rules.

### Request flow

```
Browser
  │
  ▼
Next.js App Router (src/proxy.ts refreshes the Supabase session cookie
  │                and redirects anonymous users away from /account, /admin)
  ├── Server Components ─────── read data with the user's own session
  ├── Server Actions ────────── auth, cart pricing, checkout, profile, admin mutations
  └── Route Handlers ────────── POST /api/webhooks/stripe · GET /auth/confirm
  │
  ▼
Supabase
  ├── Auth (email/password, confirmation and recovery emails)
  └── PostgreSQL
        ├── Row Level Security on every table
        ├── column-level privileges
        ├── SECURITY DEFINER functions: create_order, apply_checkout_event, release_pending_order
        └── triggers: order-status guard, restock on cancel, profile creation, updated_at
```

Two Supabase clients are used deliberately:

| Client | Key | Used for |
|---|---|---|
| Request-scoped server client (`src/lib/supabase/server.ts`) | anon key + the user's session cookie | Everything a user does, **including admin actions**, so RLS always applies |
| Service-role client (`src/lib/supabase/admin.ts`, `server-only`) | service-role key | Only work no user may do directly: creating orders, applying webhook events, email bookkeeping |

### Checkout and payment flow

```
Cart (browser stores only { productId, quantity })
  │
  ▼
startCheckout  (Server Action)
  ├─ require an authenticated user
  ├─ validate the input with Zod (unknown fields such as a price are stripped)
  └─ create_order()  ── one Postgres transaction:
        lock product rows (FOR UPDATE) → check active and in stock →
        reserve stock → insert order and item snapshots using DATABASE prices
  │
  ▼
Stripe Checkout Session  (created on the server from the stored order;
  │                       metadata.order_id, 30-minute expiry, idempotency key)
  │   on any failure: expire the session and release the reserved stock
  ▼
Customer pays on Stripe's hosted page
  │
  ▼
POST /api/webhooks/stripe
  ├─ read the raw body and verify the Stripe-Signature header (invalid → 400)
  ├─ map checkout.session.completed / async_payment_succeeded / async_payment_failed / expired
  └─ apply_checkout_event()  ── one Postgres transaction:
        record event id in webhook_events (already seen → "duplicate", stop)
        lock the order → check amount_total and currency against the order
        guarded transition: pending → paid   (or cancel and release stock on failure or expiry)
  │
  ▼
Confirmation email, sent only on a fresh transition and at most once per order
  │
  ▼
/checkout/success polls the order and shows the state the webhook wrote
```

If the database write fails, the transaction, including the event-ledger row, rolls back and the route returns `500`, so Stripe retries the event.

---

## Security architecture

| Area | What is implemented |
|---|---|
| **Authentication** | Supabase Auth with `@supabase/ssr` cookie sessions (PKCE). The server identifies users with `auth.getUser()`, which is validated by the Auth server. Sign-up and password reset return the same response whether or not the email exists. |
| **Authorization** | Checked in three independent places: page-level guards, `assertAdmin()` in every admin Server Action, and RLS in Postgres. Admin pages check the role themselves, because layouts and pages render in parallel. |
| **Row Level Security** | Enabled on every table, with table and column privileges revoked first. Customers read only their own profile, orders and order items, and can update only their own `full_name`. Admins can update only the order `status` column, never money fields. No user can insert orders, change roles or touch `webhook_events`. |
| **Business rules in the database** | A trigger rejects invalid status changes for everyone, including admins; for example, nobody can ship an order that isn't paid. `CHECK` constraints cover prices, stock, quantities and line totals. |
| **Server-side pricing** | Totals are computed inside `create_order()` from the `products` table. The webhook also refuses to mark an order paid if Stripe's amount or currency differs. |
| **Webhook integrity** | Signature verified on the raw body with `STRIPE_WEBHOOK_SECRET`; event ids are recorded in a ledger inside the same transaction; transitions are guarded so duplicate or out-of-order events are harmless. |
| **Server-only secrets** | Secret keys are read only in modules marked `import "server-only"`; the service-role client can't be bundled for the browser. |
| **Input validation** | Every Server Action parses its input with Zod. Search terms are cleaned before use in PostgREST filters, and image URLs must be `https` URLs from an allowlisted host. |
| **Redirects** | `safeNextPath()` accepts only same-origin relative paths, which blocks open redirects through `?next=`. Stripe return URLs are built from `NEXT_PUBLIC_SITE_URL`, not from request headers. |
| **XSS** | React escaping and no `dangerouslySetInnerHTML`. Email templates HTML-escape all dynamic values. |
| **Error handling** | Users see generic messages; details are logged on the server only. The global error page never renders `error.message`. |
| **Abuse limits** | At most 3 pending orders per customer, so stock can't be hoarded by abandoned checkouts. Supabase Auth applies its own rate limits. |
| **HTTP headers** | `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS are set; `X-Powered-By` is turned off. |

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions, Turbopack), React 19, TypeScript 5 |
| UI | Tailwind CSS 4, shadcn/ui components on Radix UI, lucide-react icons, sonner toasts |
| Backend and data | Supabase (Auth and PostgreSQL), `@supabase/ssr`, `@supabase/supabase-js` |
| Payments | Stripe Checkout and webhooks (`stripe` Node SDK v23) |
| Email | Resend |
| Validation | Zod 4 |
| Testing | Vitest (unit and integration), pgTAP via the Supabase CLI (database), Playwright (end-to-end) |
| Tooling | ESLint, Prettier, Supabase CLI (local stack and migrations) |

## Project structure

```
src/
├── app/                        App Router routes
│   ├── api/webhooks/stripe/    Stripe webhook (signature check, idempotent processing)
│   ├── auth/confirm/           Landing route for auth email links (confirmation and recovery)
│   ├── products/  cart/  checkout/success/
│   ├── account/                Profile and order history (signed-in users)
│   ├── admin/                  Dashboard, products and orders (admins)
│   └── sign-in/  sign-up/  forgot-password/  reset-password/
├── components/                 UI; components/ui holds the shadcn/ui primitives
├── lib/
│   ├── auth/                   Session helpers and auth Server Actions
│   ├── admin/                  Admin queries and Server Actions
│   ├── cart/                   Pure cart logic shared by client and server
│   ├── checkout/               Checkout Server Actions
│   ├── stripe/                 Stripe client, Checkout Session builder, webhook processor
│   ├── email/                  Resend sender, templates, notifications
│   ├── orders/                 Order queries and status model
│   ├── supabase/               Server, service-role and proxy clients
│   ├── validation/             Zod schemas
│   ├── security/               Safe-redirect helper
│   └── types/database.ts       Types generated from the database schema
└── proxy.ts                    Session refresh and redirects for protected routes (Next 16 "proxy")
supabase/
├── migrations/                 Schema, constraints, indexes, RLS, SQL functions and triggers
├── seed.sql                    Demo catalog (15 fictional products)
├── tests/database/             pgTAP tests for RLS and business rules
└── config.toml                 Local Supabase configuration
scripts/seed-users.mts          Creates the demo admin and customer accounts
tests/
├── unit/                       Vitest unit tests
├── integration/                Webhook route against the real local database
└── e2e/                        Playwright end-to-end tests
```

---

## Getting started

### Prerequisites
- Node.js 20.9 or later (developed on Node 24) and npm
- Docker, to run Supabase locally
- Optional: a Stripe account (test mode), the [Stripe CLI](https://docs.stripe.com/stripe-cli) and a Resend account

### 1. Clone and install

```bash
git clone https://github.com/eduardomartim/voltstore.git
```

```bash
cd voltstore
```

```bash
npm install
```

### 2. Start Supabase locally

```bash
npx supabase start
```

This starts Postgres, Auth, Studio (http://127.0.0.1:54323) and a local inbox for auth emails (http://127.0.0.1:54324). Then apply the migrations and seed the catalog:

```bash
npm run db:reset
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`. Never commit it; it is already ignored by Git.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | yes | Base URL used for Stripe redirects and auth email links |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase API URL (shown by `npx supabase status`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public anon key, protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only; bypasses RLS |
| `STRIPE_SECRET_KEY` | for checkout | Stripe test-mode secret key |
| `STRIPE_WEBHOOK_SECRET` | for webhooks | Signing secret printed by `stripe listen` (or from the Dashboard endpoint) |
| `RESEND_API_KEY` | optional | Without it, emails are logged instead of sent |
| `EMAIL_FROM` | optional | Sender address |
| `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`, `DEMO_CUSTOMER_EMAIL`, `DEMO_CUSTOMER_PASSWORD` | for `seed:users` | Local demo accounts; choose your own passwords |

### 4. Create the demo accounts and run

```bash
npm run seed:users
```

```bash
npm run dev
```

Open http://localhost:3000. Sign in with the demo admin account to reach `/admin`. Accounts you create through sign-up are customers; promote one with SQL if needed: `update profiles set role = 'admin' where email = '…';`

### Stripe local development

1. Put your **test-mode** secret key in `STRIPE_SECRET_KEY`.
2. Log the Stripe CLI in to the **same account or sandbox** that `STRIPE_SECRET_KEY` belongs to. `stripe listen` only receives events from the account it is authenticated with. If the two differ, Checkout succeeds but no webhook ever arrives.
   ```bash
   stripe login
   ```
3. Forward the events the app handles to the webhook route:
   ```bash
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired --forward-to localhost:3000/api/webhooks/stripe
   ```
4. Copy the `whsec_…` value it prints into `STRIPE_WEBHOOK_SECRET` and restart `npm run dev`.
5. Pay with test card `4242 4242 4242 4242`, any future expiry date and any CVC. The success page switches to "confirmed" once the webhook has been processed.

To replay an existing event, for example while debugging: `stripe events resend <event_id>`. In a deployed environment, register `https://<your-domain>/api/webhooks/stripe` in the Stripe Dashboard for the same four events and use that endpoint's signing secret.

### Resend

Set `RESEND_API_KEY`. With the default sender `onboarding@resend.dev`, Resend only delivers to the email address of your own Resend account. To send to other recipients, verify a domain and set `EMAIL_FROM`. Sign-up confirmation and password-reset emails are sent by Supabase Auth, not Resend.

---

## Testing

| Command | Suite | What it covers |
|---|---|---|
| `npm test` | Vitest: 77 unit tests and 5 integration tests | Cart maths and limits, rejection of tampered cart data, Zod schemas, BRL price parsing, open-redirect protection, search-term cleaning, Checkout Session parameters, webhook event mapping and idempotency, Stripe signature verification, order lifecycle rules, HTML escaping in emails. **Integration:** the real webhook route against local Postgres: bad signatures rejected, stock reserved, order paid exactly once across redeliveries (one email), amount mismatch refused, expiry releases stock. |
| `npm run test:db` | pgTAP: 27 assertions | RLS for anonymous, customer and admin users; no self-promotion to admin; no direct order inserts or calls to privileged functions; totals computed by the database; out-of-stock rejection; pending-order cap; no shipping unpaid orders; webhook idempotency |
| `npm run test:e2e` | Playwright: 24 tests (desktop and mobile) | Catalog, search and filters, product pages, cart, cart tampering, sign-up with a **real email confirmation link**, **password recovery by email**, sessions, protected routes, open-redirect blocking, access to another customer's order (IDOR), customer blocked from admin, admin product and stock management, admin order lifecycle, checkout start (redirect to Stripe when keys are configured), forged success page, mobile layout |
| `npm run lint` / `npm run typecheck` / `npm run build` | Static checks | ESLint, TypeScript, production build |

The integration, database and end-to-end suites need the local Supabase stack running. The E2E email tests read the local inbox, so the app must be reachable at `NEXT_PUBLIC_SITE_URL`.

## Security notes

- All secrets come from environment variables. `.env*` files are ignored by Git, except `.env.example`, which contains only placeholders.
- `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `RESEND_API_KEY` are only read on the server. Never prefix them with `NEXT_PUBLIC_`.
- Use Stripe **test-mode** keys for this project.

## Known limitations

- No shipping address, tax or shipping cost; the order total equals the subtotal.
- Refunds aren't automated. The `refunded` payment status exists in the schema, but nothing sets it; refunds would be issued in the Stripe Dashboard.
- A payment that arrives after its order was cancelled (a rare race with session expiry) is recorded and logged for manual review; it isn't fulfilled automatically.
- If an email fails to send after a successful payment, the failure is logged but not retried.
- The cart lives in the browser's `localStorage` and doesn't follow a user across devices.
- Product images must be URLs from `images.unsplash.com`; there is no upload pipeline. Categories are managed through the seed file or SQL, not the admin UI.
- No application-level rate limiting beyond Supabase Auth's limits and the pending-order cap, and no Content-Security-Policy header.
- Unknown product URLs render the not-found page with HTTP status 200, because Next.js has already started streaming the response; the page is marked `noindex`.
- Paying on Stripe's hosted page isn't automated in the test suite. The webhook path is covered by integration tests with signed events.

## Portfolio notes

VoltStore is a demonstration project written to show engineering decisions rather than breadth of features: correctness and security rules enforced at the database layer, server-side trust boundaries, idempotent payment processing, and tests at the unit, database and browser level. All products, prices and accounts are fictional.

## Author

**Eduardo Martim** · [github.com/eduardomartim](https://github.com/eduardomartim)
