# VoltStore

A full-stack e-commerce application for a fictional tech-accessories store, built with Next.js, Supabase and Stripe. The storefront is branded **Voltline**.

**Live demo:** https://voltstore-beta.vercel.app. Payments run in **Stripe test mode**: use card `4242 4242 4242 4242`. No real products are sold or shipped.

This is a portfolio project. The goal was not a large feature set. It was to get the parts of e-commerce that are easy to get wrong right, and to prove it with automated tests and a working production deployment:

- **who can read or change which data**, enforced by PostgreSQL Row Level Security and not only by the UI
- **what a customer pays**: prices always come from the database, never from the browser
- **when an order counts as paid**: only when a signature-verified Stripe webhook says so, processed exactly once
- **that stock is consistent**: it can't be oversold or left stuck in abandoned checkouts

---

## Contents

[Overview](#overview) · [Key features](#key-features) · [Architecture](#architecture) · [Core flows](#core-flows) · [Security](#security) · [Tech stack](#tech-stack) · [Project structure](#project-structure) · [Testing](#testing) · [Production status](#production-status) · [Running locally](#running-locally) · [Deployment](#deployment) · [Environment variables](#environment-variables) · [Reproduction notes](#reproduction-notes) · [Known limitations](#known-limitations)

---

## Overview

Customers browse a catalog, build a cart, create an account and pay through Stripe Checkout. Payment confirmation arrives asynchronously through a Stripe webhook. That webhook is the single source of truth: it moves the order to `paid` and triggers the confirmation email. Administrators manage products, stock and the order fulfilment lifecycle from a protected admin area.

The business rules that must never be violated live in PostgreSQL itself (transactions, row locks, constraints, triggers and RLS policies), so they hold no matter which code path touches the data.

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
- Order confirmation when payment is received, payment-failed notice, order status updates, and a welcome email after the address is confirmed
- See [Order confirmation email](#4-order-confirmation-email) for the production sending-domain requirement

---

## Architecture

A modular monolith on the Next.js App Router. There are no separate backend services: server-side logic runs in Server Components, Server Actions and one API route, and the database enforces the critical rules.

```
Browser
  │
  ▼
Next.js App Router on Vercel
  │   src/proxy.ts refreshes the Supabase session cookie and redirects
  │   anonymous users away from /account and /admin
  ├── Server Components ─────── read data with the user's own session
  ├── Server Actions ────────── auth, cart pricing, checkout, profile, admin mutations
  └── Route Handlers ────────── POST /api/webhooks/stripe · GET /auth/confirm
  │
  ├──────────────► Stripe (Checkout Sessions, signed webhook events)
  ├──────────────► Resend (transactional email)
  ▼
Supabase
  ├── Auth: email/password, plus confirmation and recovery emails
  └── PostgreSQL
        ├── Row Level Security on every table, plus column-level privileges
        ├── SECURITY DEFINER functions: create_order, apply_checkout_event, release_pending_order
        └── triggers: order-status guard, restock on cancel, profile creation, updated_at
```

Two Supabase clients are used deliberately:

| Client | Key | Used for |
|---|---|---|
| Request-scoped server client (`src/lib/supabase/server.ts`) | anon key + the user's session cookie | Everything a user does, **including admin actions**, so RLS always applies |
| Service-role client (`src/lib/supabase/admin.ts`, `server-only`) | service-role key | Only work no user may do directly: creating orders, applying webhook events, email bookkeeping |

---

## Core flows

### 1. Checkout

```
Cart (the browser stores only { productId, quantity })
  │
  ▼
startCheckout  (Server Action, src/lib/checkout/actions.ts)
  ├─ require an authenticated user
  ├─ validate the input with Zod (unknown fields such as a price are stripped)
  ├─ create the order (see flow 2)
  └─ create a Stripe Checkout Session from the stored order
       · line items use the order's database price snapshots, in BRL
       · metadata.order_id and client_reference_id link the session to the order
       · 30-minute expiry, idempotency key per order
       · success_url and cancel_url are built from NEXT_PUBLIC_SITE_URL
  │   on any failure: expire the session if one was created, release the reserved stock
  ▼
Redirect to Stripe's hosted payment page
```

### 2. Order creation and stock reservation

`create_order()` (in `supabase/migrations/`) runs as a single Postgres transaction. It can only be executed with the service role.

1. Rejects the request if the customer already has 3 pending orders created within the last hour.
2. Locks each product row (`SELECT … FOR UPDATE`, in a deterministic order).
3. Checks that each product is active and has enough stock.
4. Decrements stock, which is the reservation.
5. Inserts the order and the item snapshots (name, unit price, quantity, line total) using **database prices**.

If anything fails, nothing is written. Reserved stock is returned by a trigger whenever an order moves to `cancelled`: when checkout expires, payment fails, checkout can't be started, or an admin cancels the order.

### 3. Stripe webhook

```
POST /api/webhooks/stripe   (src/app/api/webhooks/stripe/route.ts)
  ├─ read the raw request body
  ├─ verify the Stripe-Signature header with STRIPE_WEBHOOK_SECRET   (invalid → 400)
  ├─ map the event (src/lib/stripe/webhook.ts):
  │     checkout.session.completed (payment_status = paid) → paid
  │     checkout.session.async_payment_succeeded           → paid
  │     checkout.session.async_payment_failed              → failed
  │     checkout.session.expired                           → expired
  └─ apply_checkout_event()  ── one Postgres transaction:
        · record the event id in webhook_events; if already present, return "duplicate" and stop
        · lock the order and check amount_total and currency against the order
        · guarded transition: only pending → paid, or cancel and release stock on failure or expiry
  │
  ▼
On a fresh "paid" transition: send the order confirmation email (flow 4)
```

If the database write fails, the whole transaction, including the event-ledger row, rolls back and the route returns `500`, so Stripe retries. Redelivered or out-of-order events can't fulfil an order twice.

### 4. Order confirmation email

1. The webhook reports a fresh `pending → paid` transition.
2. `sendOrderConfirmation()` (`src/lib/email/notifications.ts`) claims the order by setting `confirmation_email_sent_at` with a conditional update, so the email is sent at most once.
3. It loads the order and its items, renders the template (`src/lib/email/templates.ts`, with all dynamic values HTML-escaped) and calls `resend.emails.send()` (`src/lib/email/send.ts`). The sender is `EMAIL_FROM`; the recipient is the customer's account email stored on the order.
4. If Resend rejects the email, the failure is logged, the claim is released, and the webhook still returns 200, because the payment is already recorded.

> **Production email delivery and sending domains.** Transactional email is implemented with Resend. The application correctly generates and sends order confirmation messages through the Resend API. Resend's testing sender (`onboarding@resend.dev`) only delivers to the Resend account owner's email address. Sending to arbitrary customer addresses requires a verified sending domain in Resend and setting `EMAIL_FROM` to an address on that domain. No application code change is required: this is an external production configuration step.
>
> The live demo currently uses the testing sender, so confirmation emails are delivered only to the account owner's address. Emails to other customers are rejected by Resend; the rejection is logged and the order is unaffected.

Sign-up confirmation and password-reset emails are sent by **Supabase Auth**, not Resend, so this restriction doesn't apply to them.

---

## Security

| Area | Implementation |
|---|---|
| **Authentication** | Supabase Auth with `@supabase/ssr` cookie sessions (PKCE). The server identifies users with `auth.getUser()`, which is validated by the Auth server. Sign-up and password reset return the same response whether or not the email exists. |
| **Route protection** | `src/proxy.ts` redirects anonymous users away from `/account` and `/admin`. Pages also check access themselves; admin pages check the role on their own, because layouts and pages render in parallel. |
| **Authorization** | Checked in three independent places: page-level guards, `assertAdmin()` in every admin Server Action, and RLS in Postgres. |
| **Row Level Security** | Enabled on every table, with table and column privileges revoked first. Customers read only their own profile, orders and order items, and can update only their own `full_name`. Admins can update only the order `status` column, never money fields. No user can insert orders, change roles or touch `webhook_events`. |
| **Server-side secrets** | Secret keys are read only in modules marked `import "server-only"`; the service-role client can't be bundled for the browser. |
| **Server-side pricing** | Totals are computed inside `create_order()` from the `products` table. The webhook also refuses to mark an order paid if Stripe's amount or currency differs. |
| **Stripe webhook verification** | Signature verified on the raw body; event ids are recorded in a ledger inside the same transaction; transitions are guarded so duplicate events are harmless. |
| **Stock control** | Row locks in `create_order()`, `CHECK (stock_quantity >= 0)`, automatic restock on cancellation, and a cap of 3 pending orders per customer per hour so stock can't be hoarded. |
| **Business rules in the database** | A trigger rejects invalid status changes for everyone, including admins; for example, nobody can ship an unpaid order. `CHECK` constraints cover prices, quantities and line totals. |
| **Failure handling** | Checkout failures expire the Stripe session and release stock. Webhook database failures roll back and trigger a Stripe retry. Email failures are logged without affecting the order. Users see generic messages, with details logged on the server only, and the global error page never renders `error.message`. |
| **Input validation** | Every Server Action parses its input with Zod. Search terms are cleaned before use in PostgREST filters, and image URLs must be `https` URLs from an allowlisted host. |
| **Redirects** | `safeNextPath()` accepts only same-origin relative paths, which blocks open redirects through `?next=`. Stripe and email URLs come from `NEXT_PUBLIC_SITE_URL`, not from request headers. |
| **XSS** | React escaping and no `dangerouslySetInnerHTML`. Email templates HTML-escape all dynamic values. |
| **HTTP headers** | `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS are set; `X-Powered-By` is turned off. |

All secrets come from environment variables. `.env*` files are ignored by Git, except `.env.example`, which contains only placeholders.

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
| Hosting | Vercel (app), Supabase (database and auth) |
| Tooling | ESLint, Prettier, Supabase CLI |

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
│   ├── env.ts                  Server-side environment access
│   └── types/database.ts       Types generated from the database schema
└── proxy.ts                    Session refresh and protected-route redirects (Next 16 "proxy")
supabase/
├── migrations/                 Schema, constraints, indexes, RLS, SQL functions and triggers
├── seed.sql                    Demo catalog: 6 categories and 15 fictional products
├── tests/database/             pgTAP tests for RLS and business rules
└── config.toml                 Local Supabase configuration
scripts/seed-users.mts          Creates the local demo admin and customer accounts
tests/
├── unit/                       Vitest unit tests
├── integration/                Webhook route against the real local database
└── e2e/                        Playwright end-to-end tests
```

---

## Testing

The strategy is to test each layer where its rules live: pure logic with unit tests, the payment boundary with integration tests against a real database, the security rules inside Postgres with pgTAP, and user-facing behaviour in a real browser.

| Command | Suite | Result | What it covers |
|---|---|---|---|
| `npm test` | Vitest: 77 unit + 5 integration tests | **82/82 passing** | Cart maths and limits, rejection of tampered cart data, Zod schemas, BRL price parsing, open-redirect protection, search-term cleaning, Checkout Session parameters, webhook event mapping and idempotency, Stripe signature verification, order lifecycle, HTML escaping in emails. **Integration:** the real webhook route against local Postgres: bad signatures rejected, stock reserved, order paid exactly once across redeliveries (one email), amount mismatch refused, expiry releases stock. |
| `npm run test:db` | pgTAP | **27/27 passing** | RLS for anonymous, customer and admin users; no self-promotion to admin; no direct order inserts or calls to privileged functions; totals computed by the database; out-of-stock rejection; pending-order cap; no shipping unpaid orders; webhook idempotency |
| `npm run test:e2e` | Playwright: desktop and mobile | **24/24 passing** | Catalog, search and filters, product pages, cart, cart tampering, sign-up with a real email confirmation link, password recovery by email, sessions, protected routes, open-redirect blocking, access to another customer's order (IDOR), customer blocked from admin, admin product and stock management, admin order lifecycle, checkout start (redirect to Stripe), forged success page, mobile layout |
| `npm run lint` · `npm run typecheck` · `npm run build` | Static checks | **passing** | ESLint, TypeScript, production build |

Dependency audit: `npm audit --omit=dev` reports **0 vulnerabilities** in production dependencies. The remaining `npm audit` alerts come from development-only tooling (the `shadcn` CLI and `eslint-config-next`, through `braces`). No patched release is available, and they aren't part of the deployed runtime.

Integration, database and E2E tests need the local Supabase stack (`npx supabase start`). The E2E email tests read the local Supabase inbox, so the app must run at `NEXT_PUBLIC_SITE_URL`, which is `http://localhost:3000` by default.

## Production status

Deployed on Vercel with a dedicated Supabase project and Stripe in test mode. The following were validated manually in production:

- authentication: sign-up, email confirmation, sign-in
- product catalog
- cart
- Stripe Checkout
- Stripe webhook delivery to `/api/webhooks/stripe`
- order creation and stock reservation after payment
- order history (`/account/orders`) and order details

Email delivery in production is subject to the sending-domain requirement described in [Order confirmation email](#4-order-confirmation-email).

---

## Running locally

### Prerequisites
- Node.js 20.9 or later (developed on Node 24) and npm
- Docker, to run Supabase locally
- Optional: a Stripe account in test mode, the [Stripe CLI](https://docs.stripe.com/stripe-cli), and a Resend account

### Steps

```bash
git clone https://github.com/eduardomartim/voltstore.git
```

```bash
cd voltstore
```

```bash
npm install
```

Start the local Supabase stack. This starts Postgres, Auth, Studio at http://127.0.0.1:54323 and a local inbox for auth emails at http://127.0.0.1:54324.

```bash
npx supabase start
```

Apply the migrations and seed the catalog:

```bash
npm run db:reset
```

Create `.env.local` from the template and fill it in (see [Environment variables](#environment-variables)). The local Supabase URL and keys are shown by `npx supabase status`.

```bash
cp .env.example .env.local
```

Create the demo admin and customer accounts from the `DEMO_*` variables:

```bash
npm run seed:users
```

```bash
npm run dev
```

Open http://localhost:3000. Sign in with the demo admin account to reach `/admin`. Accounts created through sign-up are customers; promote one with SQL if needed: `update profiles set role = 'admin' where email = '…';`

### Stripe (local)

1. Put your **test-mode** secret key in `STRIPE_SECRET_KEY`.
2. Log the Stripe CLI in to the **same account or sandbox** that `STRIPE_SECRET_KEY` belongs to:
   ```bash
   stripe login
   ```
3. Forward the events the app handles:
   ```bash
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired --forward-to localhost:3000/api/webhooks/stripe
   ```
4. Copy the `whsec_…` value it prints into `STRIPE_WEBHOOK_SECRET` and restart `npm run dev`.
5. Pay with `4242 4242 4242 4242`, any future expiry date and any CVC.

### Running the tests

The local Supabase stack must be running for every suite except lint, typecheck and build.

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run test:db
```

```bash
npm run test:e2e
```

```bash
npm run build
```

---

## Deployment

The production setup is Vercel for the app, a hosted Supabase project, Stripe in test mode and, optionally, Resend.

### Supabase (hosted)
1. Create a project and link the CLI to it: `npx supabase link --project-ref <ref>`.
2. Apply the schema and the demo catalog. `db push` alone applies only migrations; `--include-seed` also runs `supabase/seed.sql`.
   ```bash
   npx supabase db push --include-seed
   ```
3. In **Authentication → URL Configuration**, set the Site URL to your production URL and add `https://<your-domain>/**` to the Redirect URLs. The `localhost` entries in `supabase/config.toml` only apply to the local stack.
4. For real users, configure custom SMTP in Supabase Auth. The built-in email service is rate-limited and meant for testing.

### Vercel
1. Import the repository. The default Next.js settings work; no `vercel.json` is needed.
2. Set the [environment variables](#environment-variables) for the Production environment, including `NEXT_PUBLIC_SITE_URL=https://<your-domain>`.
3. Deploy. **Redeploy after changing any `NEXT_PUBLIC_*` variable**, because Next.js bakes those values into the build.

### Stripe (production endpoint)
1. In the Stripe Dashboard, in the same account and mode as `STRIPE_SECRET_KEY`, add a webhook endpoint at `https://<your-domain>/api/webhooks/stripe` with these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
2. Put that endpoint's signing secret in `STRIPE_WEBHOOK_SECRET` on Vercel and redeploy.

### Resend (optional)
1. Set `RESEND_API_KEY`. With only this, emails are delivered to the Resend account owner's address.
2. To email any customer: add and verify a domain at resend.com/domains (DNS records for SPF/DKIM), then set `EMAIL_FROM` to an address on that domain, for example `VoltStore <orders@mail.example.com>`, and redeploy. No code change is needed.

## Environment variables

Names only; never commit real values. See `.env.example`.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | yes | Base URL for Stripe success and cancel URLs, auth email links and links inside emails. Baked in at build time. |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public anon key, protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only; bypasses RLS |
| `STRIPE_SECRET_KEY` | for checkout | Stripe secret key (test mode) |
| `STRIPE_WEBHOOK_SECRET` | for webhooks | Signing secret of the webhook endpoint, or the one printed by `stripe listen` locally |
| `RESEND_API_KEY` | optional | Without it, emails are logged instead of sent |
| `EMAIL_FROM` | optional | Sender address. Defaults to `Voltline <onboarding@resend.dev>`, Resend's testing sender. |
| `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`, `DEMO_CUSTOMER_EMAIL`, `DEMO_CUSTOMER_PASSWORD` | local only | Used by `npm run seed:users` |

## Reproduction notes

Issues encountered while deploying this project, and how to avoid them:

- **Stripe CLI on a different account.** `stripe listen` only receives events from the account it's logged in to. If it differs from the account of `STRIPE_SECRET_KEY`, Checkout succeeds but no webhook ever arrives. The webhook route is `/api/webhooks/stripe`.
- **Redirect to `localhost` after payment.** Stripe's success and cancel URLs come from `NEXT_PUBLIC_SITE_URL`. If it's unset or left as `http://localhost:3000` in production, set it and **redeploy**.
- **Empty catalog in production.** `supabase db push` doesn't run the seed; use `--include-seed`.
- **Auth email links.** Supabase only redirects to URLs listed in Authentication → URL Configuration.
- **Emails rejected by Resend.** This is expected with `onboarding@resend.dev` for any recipient other than the account owner; see [Order confirmation email](#4-order-confirmation-email).
- **Admin access.** New accounts are customers. Promote an admin with SQL (`update profiles set role = 'admin' where email = '…'`); the `seed:users` script is meant for the local stack.

## Known limitations

- **Production email delivery** to arbitrary customers needs a verified Resend sending domain. The live demo doesn't have one yet; this is an external configuration step, not a code change.
- If an email fails to send after a successful payment, the failure is logged but not retried automatically.
- No shipping address, tax or shipping cost; the order total equals the subtotal.
- Refunds aren't automated. The `refunded` payment status exists in the schema, but nothing sets it; refunds would be issued in the Stripe Dashboard.
- A payment that arrives after its order was cancelled (a rare race with session expiry) is recorded and logged for manual review, not fulfilled automatically.
- The cart lives in the browser's `localStorage` and doesn't follow a user across devices.
- Product images must be URLs from `images.unsplash.com`; there is no upload pipeline. Categories are managed through the seed file or SQL, not the admin UI.
- No application-level rate limiting beyond Supabase Auth's limits and the pending-order cap, and no Content-Security-Policy header.
- Unknown product URLs render the not-found page with HTTP status 200, because Next.js has already started streaming the response; the page is marked `noindex`.
- Paying on Stripe's hosted page isn't automated in the test suite. The webhook path is covered by integration tests with signed events and was validated manually in production.

## Portfolio notes

VoltStore is a demonstration project written to show engineering decisions rather than breadth of features: correctness and security rules enforced at the database layer, server-side trust boundaries, idempotent payment processing, and tests at the unit, database and browser level, backed by a working deployment. All products, prices and accounts are fictional.

## Author

**Eduardo Martim** · [github.com/eduardomartim](https://github.com/eduardomartim)
