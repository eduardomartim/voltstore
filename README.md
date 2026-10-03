# Voltline — full-stack e-commerce demo

A small, production-minded tech store built as a portfolio project. It shows the parts of e-commerce that are easy to get wrong: authentication, **database-enforced authorization (PostgreSQL RLS)**, **server-side pricing**, **Stripe Checkout with signed, idempotent webhooks**, transactional email, and automated tests at three levels (unit, database, end-to-end).

> All products are fictional and payments run in Stripe **test mode**. Nothing is sold or shipped.

**Stack:** Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Supabase (Postgres, Auth, RLS) · Stripe Checkout · Resend · Zod · Vitest · pgTAP · Playwright

---

## Features

**Store**
- Homepage with featured products and categories
- Catalog with search, category filters and sorting
- Product pages with stock status; out-of-stock products can't be added
- Cart (add, remove, change quantity, clear) with stock and quantity limits
- Loading, empty, error and not-found states; responsive from phone to desktop

**Accounts**
- Sign up with email confirmation, sign in, sign out, persistent sessions
- Password recovery and reset
- Profile (editable name), order history and order details
- Customers can only ever see their own data

**Checkout and orders**
- Stripe Checkout Session created on the server from database prices (BRL)
- Stock is reserved when the order is created and released if checkout expires or fails
- Payment is confirmed **only** by the verified Stripe webhook, never by the success redirect
- The success page polls the order status the webhook writes
- Order items store snapshots of name and unit price, so past orders never change

**Admin** (role `admin`)
- Dashboard: revenue, orders to fulfil, orders waiting for payment, low-stock list
- Create and edit products, turn them on or off, change stock
- View orders, filter by status, and move them through the lifecycle (the customer gets an email)

**Email** (Resend)
- Welcome email after the address is confirmed
- Order confirmation when payment is received, payment-failed notice, and status updates
- Without `RESEND_API_KEY`, emails are **logged and not sent**. The app never claims an email went out when it didn't.

---

## Architecture

A modular monolith. Each domain lives in its own module under `src/lib`, UI lives in `src/app` and `src/components`, and the database (schema, RLS and transactional functions) lives in `supabase/`.

```
src/
  app/                     Routes (App Router)
    api/webhooks/stripe/   Stripe webhook (raw body + signature check)
    auth/confirm/          Landing route for auth email links
    account/  admin/  cart/  checkout/success/  products/ …
  components/              UI (shadcn/ui primitives in components/ui)
  lib/
    auth/                  Session helpers, auth Server Actions
    admin/                 Admin queries and Server Actions
    cart/                  Pure cart logic (shared by client and server)
    checkout/              Checkout Server Actions
    stripe/                Stripe client, session builder, webhook processor
    email/                 Resend client, templates, notifications
    orders/                Order queries, status model
    supabase/              Server client, service-role client, proxy session refresh
    validation/            Zod schemas
    security/              Safe-redirect helper
  proxy.ts                 Refreshes the session and redirects anonymous users (Next 16 "proxy")
supabase/
  migrations/              Schema, constraints, indexes, RLS, SQL functions
  seed.sql                 Demo catalog
  tests/database/          pgTAP tests for RLS and business rules
scripts/seed-users.mts     Creates demo admin/customer accounts
tests/
  unit/                    Vitest unit tests
  integration/             Webhook route against the real local database
  e2e/                     Playwright end-to-end tests
```

**Key decisions**
- **Business rules that must hold live in Postgres.** Creating an order (pricing, stock locking and reservation), applying a payment, and allowed status changes are SQL functions and triggers, so concurrency is handled by transactions and row locks rather than application code.
- **Two Supabase clients.** Normal reads and writes use the *user's* session, so RLS applies, and that includes admin actions. The service-role client is only used in `server-only` modules for work no user may do directly: creating orders, applying webhooks, and email bookkeeping.
- **The cart stays on the client.** The browser stores only `{productId, quantity}` in `localStorage`. Prices are always fetched from the server and re-checked at checkout, so tampering with storage changes nothing (an E2E test covers this). This avoids cart tables and guest-cart merging.
- **No shipping or address step.** Shipping is free and the total equals the subtotal, which keeps the model small and the demo focused.

---

## Authentication

Supabase Auth with `@supabase/ssr` cookie sessions (PKCE flow).

- Sign up, sign in, reset and profile updates are Server Actions validated with Zod.
- Links in auth emails go to `/auth/confirm`. It accepts both `code` (PKCE) and `token_hash`, sets up the session, sends the welcome email once, and redirects only to same-origin paths (`safeNextPath` blocks open redirects).
- `src/proxy.ts` refreshes the session on every request and sends anonymous users from `/account` and `/admin` to sign in. This is a convenience, **not** the security boundary.
- Server code identifies the user with `supabase.auth.getUser()`, which is validated by the Auth server, not with unverified cookie data.
- Sign-up and password-reset responses don't reveal whether an email is registered.

## Authorization and Row Level Security

Roles are `customer` (the default, set by a trigger on `auth.users`) and `admin` (`profiles.role`). Authorization is enforced at three independent layers:

1. **UI:** the admin layout and pages check the role. Each admin page checks it again, because layouts and pages render in parallel.
2. **Server Actions:** every admin mutation calls `assertAdmin()` first.
3. **Postgres:** RLS is enabled on every table, and table and column privileges are cut back first.

| Table | anon | customer | admin |
|---|---|---|---|
| `products` | read active | read active | read all, insert, update (catalog columns only) |
| `categories` | read | read | read |
| `profiles` | — | read and update **own** row, `full_name` column only | read all |
| `orders` | — | read **own** | read all, update the **`status` column only** |
| `order_items` | — | read items of own orders | read all |
| `webhook_events` | — | — | — (service role only) |

- Nobody can insert orders from the client. Orders are created only by `create_order()`, which only the service role may execute.
- `is_admin()` is a `SECURITY DEFINER` helper so policies don't recurse.
- A trigger (`guard_order_status_change`) enforces the lifecycle for everyone, admins included: `pending → paid → processing → shipped → delivered`, with `cancelled` allowed before shipping. An order **can't be fulfilled unless `payment_status = 'paid'`**, and only the webhook can set that.
- Cancelling an order puts its stock back (trigger).

These rules are covered by the pgTAP suite in `supabase/tests/database/rls.test.sql`.

## Stripe integration

1. The client sends `{ items: [{ productId, quantity }] }` to the `startCheckout` Server Action. Any client-sent price is ignored, and Zod strips unknown keys.
2. The server checks the session and input, then calls `create_order()`. Inside one transaction it locks the product rows (`FOR UPDATE`), checks that each product is active and in stock, reserves stock, and writes the order and item snapshots using **database prices**. It also caps each customer at 3 pending orders, so nobody can hoard stock.
3. A Checkout Session is created from the stored order (BRL, `metadata.order_id`, `client_reference_id`, 30-minute expiry, idempotency key per order). If Stripe fails, the reservation is released at once.
4. The customer pays on Stripe and comes back to `/checkout/success?session_id=…`. That page **only displays** the state stored in the database.

## Webhook architecture

`POST /api/webhooks/stripe`:
- Reads the **raw body** (`request.text()`) and checks `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET`. Invalid or missing signatures get `400`.
- Handles `checkout.session.completed` (only when `payment_status = paid`), `checkout.session.async_payment_succeeded`, `async_payment_failed` and `expired`.
- Calls `apply_checkout_event()`, which in **one transaction**:
  - inserts the event id into `webhook_events`. If it already exists the result is `duplicate` and nothing else happens.
  - locks the order and applies a guarded change (only `pending → paid`), so even two *different* events for the same session can't fulfil an order twice.
  - checks that `amount_total` and `currency` match the order (otherwise `amount_mismatch`, and the order is not marked paid).
  - on failure or expiry, cancels the order and releases its stock.
- Emails are sent only when the database reports a fresh change. The order confirmation is also "claimed" with a conditional update on `confirmation_email_sent_at`, so it goes out at most once.
- If the database write fails, the transaction (ledger row included) rolls back and the route returns `500`, so Stripe retries. An email failure after a committed payment is logged and does not cause a retry.

## Database overview

`profiles`, `categories`, `products`, `orders`, `order_items`, `webhook_events`. The schema includes:
- Integer money in centavos and `CHECK` constraints (positive prices, non-negative stock, quantity 1–10, `subtotal = unit × qty`, paid orders must have `paid_at`, `currency = 'brl'`, slug format, https image URLs)
- Foreign keys, unique slugs, a unique Stripe session id, a human-readable `order_number` identity (shown as `VL-1001`)
- Indexes for catalog listing, per-user order history and status filters
- `updated_at` triggers

## Security considerations

| Concern | Mitigation |
|---|---|
| Secret exposure | Secrets are read only in `server-only` modules. No `NEXT_PUBLIC_` secrets. The built client bundle was scanned for the service key and secret variable names. |
| Price or total tampering | Prices come only from the DB inside `create_order()`. The webhook re-checks the amount. |
| IDOR | RLS on orders and order items, plus an explicit ownership check on the customer order page. Tested in pgTAP and E2E. |
| Privilege escalation | Customers can't update `role` (column privileges). Admin mutations are checked in the action **and** by RLS. |
| Webhook forgery or replay | Signature check (with Stripe's timestamp tolerance), event-id ledger, guarded state changes |
| SQL / filter injection | Parameterized queries through supabase-js. The search term is cleaned before use in PostgREST `or()` filters. |
| XSS | React escaping, no `dangerouslySetInnerHTML`. Email templates HTML-escape all dynamic text. Product images are restricted to an allowlisted host. |
| Open redirects | `safeNextPath` on sign-in and auth callbacks. Stripe redirect URLs are built from `NEXT_PUBLIC_SITE_URL`, never from request headers. |
| Error leakage | Server Actions return generic messages, and details are logged on the server only. `error.tsx` never renders `error.message`. |
| Headers | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS, no `X-Powered-By` |

---

## Testing

| Suite | Command | What it covers |
|---|---|---|
| Unit (Vitest) | `npm test` | Cart maths and limits, normalizing tampered cart storage, Zod schemas, price parsing, safe redirects, search cleanup, Checkout Session params, mapping webhook events, idempotent processing, Stripe signature checks, order lifecycle, email escaping |
| Integration (Vitest) | `npm test` | The real webhook route against local Postgres: rejects bad signatures, reserves stock, marks paid exactly once across redeliveries (one email), ignores mismatched amounts, restocks on expiry. Skipped if Supabase env vars are missing. |
| Database (pgTAP) | `npm run test:db` | RLS for anon, customer and admin; no self-promotion; no direct order inserts or RPC calls; DB-computed totals; out-of-stock rejection; pending-order cap; no shipping unpaid orders; webhook idempotency |
| End-to-end (Playwright) | `npm run test:e2e` | Store, search and filters, product page, out-of-stock, 404, cart, cart tampering, sign-up with **real email confirmation link**, **password recovery via email**, sign in/out, session persistence, open-redirect block, protected routes, IDOR, customer blocked from admin, admin product CRUD, stock and activation, admin order lifecycle, checkout start, forged success page, mobile layout |

The E2E email tests read the local Supabase inbox (Mailpit). If `STRIPE_SECRET_KEY` is set, the checkout test expects a redirect to `checkout.stripe.com`. Otherwise it expects the "payments unavailable" message, and in that case no order is created.

---

## Local setup

**Requirements:** Node.js 20.9+ (developed on Node 24), npm, and Docker (for local Supabase).

```bash
npm install
```

```bash
npx supabase start
```

```bash
cp .env.example .env.local
```

Fill in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`: copy them from `npx supabase status`
- `DEMO_ADMIN_PASSWORD` and `DEMO_CUSTOMER_PASSWORD`: choose any local passwords
- Stripe and Resend keys: optional (see below)

```bash
npm run db:reset
```

```bash
npm run seed:users
```

```bash
npm run dev
```

Open http://localhost:3000. Auth emails (confirmation and reset) are caught by the local inbox at http://127.0.0.1:54324. Supabase Studio is at http://127.0.0.1:54323.

### Demo accounts

`npm run seed:users` creates (or resets) two confirmed accounts from your `.env.local`:
- **Admin:** `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD`. Opens `/admin`.
- **Customer:** `DEMO_CUSTOMER_EMAIL` / `DEMO_CUSTOMER_PASSWORD`

To promote any other user, run this in Studio's SQL editor: `update profiles set role = 'admin' where email = '…';`

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | yes | Base URL for Stripe redirects and auth email links |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public key, protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Server only.** Bypasses RLS. |
| `STRIPE_SECRET_KEY` | for checkout | Test-mode key (`sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | for webhooks | `whsec_…` |
| `RESEND_API_KEY` | optional | Without it, emails are logged and not sent |
| `EMAIL_FROM` | optional | Defaults to `Voltline <onboarding@resend.dev>` |
| `DEMO_*` | for `seed:users` | Local demo accounts |

### Stripe setup

1. Create a Stripe account, stay in **test mode**, and copy the secret key into `STRIPE_SECRET_KEY`.
2. Forward webhooks locally with the [Stripe CLI](https://docs.stripe.com/stripe-cli):
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired
   ```
   Put the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET` and restart `npm run dev`.
3. Pay with test card `4242 4242 4242 4242`, any future date and any CVC. The success page switches to "confirmed" once the webhook arrives.

In production, add an endpoint at `https://<your-domain>/api/webhooks/stripe` in the Stripe Dashboard for the same four events, and use that endpoint's signing secret.

### Resend setup

Create an API key at resend.com and set `RESEND_API_KEY`. `onboarding@resend.dev` can only send to your own Resend account email. To email other people, verify a domain and set `EMAIL_FROM`. Password-reset and confirmation emails are sent by Supabase Auth itself (configure SMTP in Supabase for production).

### Supabase (hosted) setup

1. Create a project and link it: `npx supabase link --project-ref <ref>`.
2. Push the schema: `npx supabase db push`. Then load the catalog by running `supabase/seed.sql` in the SQL editor.
3. In **Auth → URL Configuration**, set the Site URL and add `https://<your-domain>/**` to the redirect URLs. Keep email confirmations on.
4. Copy the project URL, anon key and service-role key into your deployment's environment variables.

## Deployment

The app is a standard Next.js app (for example on Vercel). Set every environment variable above (with `NEXT_PUBLIC_SITE_URL` as your production URL), register the Stripe webhook endpoint, and deploy. `npm run build && npm start` runs it on any Node host.

## Scripts

`dev` · `build` · `start` · `lint` · `typecheck` · `test` · `test:e2e` · `test:db` · `db:reset` · `db:types` (regenerate `src/lib/types/database.ts`) · `seed:users` · `format`

## Known limitations

- No shipping address, tax or shipping cost. The total equals the subtotal.
- Refunds aren't automated. `payment_status = refunded` exists in the model, but nothing sets it yet. Refunds would be issued in the Stripe Dashboard.
- A payment that arrives after its order was cancelled (a rare race with session expiry) is recorded as paid on the cancelled order and logged for manual review. It isn't fulfilled automatically.
- If a confirmation email fails after payment, it's logged and not retried automatically.
- The cart lives in `localStorage` per browser. It doesn't follow a user between devices.
- Product images must come from `images.unsplash.com` (no upload pipeline). Categories are managed through the seed or SQL, not the admin UI.
- There is no app-level rate limiting beyond Supabase Auth's limits and the pending-order cap. There is no Content-Security-Policy header.
- Unknown product URLs render the not-found page with an HTTP 200 status, because Next.js has already started streaming the page (the page is marked `noindex`).
- End-to-end payment through Stripe's hosted page isn't automated in CI. The webhook path is covered by integration tests with signed events.
