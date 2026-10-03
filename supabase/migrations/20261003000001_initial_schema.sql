-- =============================================================================
-- Voltline — initial schema
-- Tables, constraints, indexes, Row Level Security and transactional functions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('customer', 'admin');
create type public.order_status as enum ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, holds the application role
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text check (char_length(full_name) <= 120),
  role public.user_role not null default 'customer',
  welcome_email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically when a user signs up. Role is always 'customer';
-- admins are promoted explicitly by a privileged operator.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role check used by RLS policies. SECURITY DEFINER avoids recursive RLS
-- evaluation on profiles; it only ever answers for the calling user.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- products — prices are stored as integer minor units (centavos)
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '' check (char_length(description) <= 4000),
  price_cents integer not null check (price_cents > 0 and price_cents <= 10000000),
  currency text not null default 'brl' check (currency = 'brl'),
  image_url text check (image_url is null or image_url ~ '^https://'),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_active boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_category_id_idx on public.products (category_id);
create index products_active_created_idx on public.products (is_active, created_at desc);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity (start with 1001) unique,
  user_id uuid not null references public.profiles (id) on delete restrict,
  customer_email text not null,
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'pending',
  subtotal_cents integer not null check (subtotal_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  currency text not null default 'brl' check (currency = 'brl'),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  confirmation_email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A paid order must have a payment timestamp.
  constraint orders_paid_has_timestamp check (payment_status <> 'paid' or paid_at is not null)
);

create index orders_user_id_created_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- order_items — immutable snapshots of name and price at purchase time
-- ---------------------------------------------------------------------------
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  product_image_url text,
  unit_price_cents integer not null check (unit_price_cents > 0),
  quantity integer not null check (quantity between 1 and 10),
  subtotal_cents integer not null,
  created_at timestamptz not null default now(),
  constraint order_items_subtotal_matches check (subtotal_cents = unit_price_cents * quantity),
  constraint order_items_unique_product unique (order_id, product_id)
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

-- ---------------------------------------------------------------------------
-- webhook_events — processed Stripe event ids (idempotency ledger)
-- ---------------------------------------------------------------------------
create table public.webhook_events (
  id text primary key,
  type text not null,
  order_id uuid references public.orders (id) on delete set null,
  outcome text not null,
  processed_at timestamptz not null default now()
);

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.webhook_events enable row level security;

-- Tighten table privileges first; RLS then filters rows.
revoke all on public.profiles, public.categories, public.products,
  public.orders, public.order_items, public.webhook_events from anon, authenticated;

grant select on public.categories, public.products to anon, authenticated;
grant select on public.profiles, public.orders, public.order_items to authenticated;
-- Customers may only change their display name; role/email are not updatable.
grant update (full_name) on public.profiles to authenticated;
-- Admin catalog management (row access is still gated by RLS below).
grant insert (category_id, name, slug, description, price_cents, image_url, stock_quantity, is_active, is_featured)
  on public.products to authenticated;
grant update (category_id, name, slug, description, price_cents, image_url, stock_quantity, is_active, is_featured)
  on public.products to authenticated;
-- Admin fulfilment: only the order lifecycle status is updatable, never money fields.
grant update (status) on public.orders to authenticated;
-- webhook_events: no grants to anon/authenticated at all (service role only).

-- profiles
create policy "profiles: users read own, admins read all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles: users update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- categories
create policy "categories: public read"
  on public.categories for select to anon, authenticated
  using (true);

-- products
create policy "products: public reads active, admins read all"
  on public.products for select to anon, authenticated
  using (is_active or (select public.is_admin()));

create policy "products: admins insert"
  on public.products for insert to authenticated
  with check ((select public.is_admin()));

create policy "products: admins update"
  on public.products for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- orders: created exclusively by the server (service role) via create_order().
create policy "orders: owners and admins read"
  on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "orders: admins update status"
  on public.orders for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- order_items
create policy "order_items: visible with parent order"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

-- Guard: orders may only move along a sensible lifecycle, and nobody can mark
-- an order as fulfilled before payment was confirmed by Stripe.
--   pending    -> paid (requires payment_status = paid) | cancelled
--   paid       -> processing | shipped | cancelled
--   processing -> shipped | cancelled
--   shipped    -> delivered
--   delivered, cancelled are final
create or replace function public.guard_order_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status in ('paid', 'processing', 'shipped', 'delivered') and new.payment_status <> 'paid' then
    raise exception 'ORDER_NOT_PAID' using errcode = 'check_violation';
  end if;

  if not (
       (old.status = 'pending'    and new.status in ('paid', 'cancelled'))
    or (old.status = 'paid'       and new.status in ('processing', 'shipped', 'cancelled'))
    or (old.status = 'processing' and new.status in ('shipped', 'cancelled'))
    or (old.status = 'shipped'    and new.status = 'delivered')
  ) then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger orders_guard_status
  before update on public.orders
  for each row execute function public.guard_order_status_change();

-- Return reserved/sold stock whenever an order is cancelled before shipping.
create or replace function public.restock_cancelled_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products p
    set stock_quantity = p.stock_quantity + oi.quantity
    from public.order_items oi
    where oi.order_id = new.id and oi.product_id = p.id;
  return new;
end;
$$;

create trigger orders_restock_on_cancel
  after update of status on public.orders
  for each row
  when (new.status = 'cancelled' and old.status <> 'cancelled')
  execute function public.restock_cancelled_order();

revoke execute on function public.restock_cancelled_order() from public, anon, authenticated;
revoke execute on function public.guard_order_status_change() from public, anon, authenticated;

-- =============================================================================
-- Transactional functions (server-only: executable by service_role only)
-- =============================================================================

-- Creates a pending order from {product_id, quantity} pairs. Prices, names and
-- totals are read from the products table — never from the client. Stock is
-- reserved atomically (rows locked FOR UPDATE) and released if checkout fails.
create or replace function public.create_order(
  p_user_id uuid,
  p_customer_email text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_item record;
  v_product public.products%rowtype;
  v_subtotal integer := 0;
  v_count integer;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_ITEMS' using errcode = 'P0001';
  end if;

  v_count := jsonb_array_length(p_items);
  if v_count = 0 or v_count > 20 then
    raise exception 'INVALID_ITEMS' using errcode = 'P0001';
  end if;

  -- Abuse guard: every pending order reserves stock until its Checkout Session
  -- expires, so cap how many a single customer can hold at once.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  if (select count(*) from public.orders
      where user_id = p_user_id and status = 'pending' and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'TOO_MANY_PENDING_ORDERS' using errcode = 'P0001';
  end if;

  insert into public.orders (user_id, customer_email, subtotal_cents, total_cents)
  values (p_user_id, p_customer_email, 0, 0)
  returning id into v_order_id;

  for v_item in
    select (e ->> 'product_id')::uuid as product_id, (e ->> 'quantity')::int as quantity
    from jsonb_array_elements(p_items) e
    order by 1 -- deterministic lock order avoids deadlocks
  loop
    if v_item.quantity is null or v_item.quantity < 1 or v_item.quantity > 10 then
      raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
    end if;

    select * into v_product from public.products
    where id = v_item.product_id
    for update;

    if not found or not v_product.is_active then
      raise exception 'PRODUCT_UNAVAILABLE:%', v_item.product_id using errcode = 'P0001';
    end if;

    if v_product.stock_quantity < v_item.quantity then
      raise exception 'INSUFFICIENT_STOCK:%', v_item.product_id using errcode = 'P0001';
    end if;

    update public.products
      set stock_quantity = stock_quantity - v_item.quantity
      where id = v_product.id;

    insert into public.order_items
      (order_id, product_id, product_name, product_image_url, unit_price_cents, quantity, subtotal_cents)
    values
      (v_order_id, v_product.id, v_product.name, v_product.image_url, v_product.price_cents,
       v_item.quantity, v_product.price_cents * v_item.quantity);

    v_subtotal := v_subtotal + v_product.price_cents * v_item.quantity;
  end loop;

  update public.orders
    set subtotal_cents = v_subtotal, total_cents = v_subtotal
    where id = v_order_id;

  return v_order_id;
end;
$$;

-- Cancels a still-pending order (stock is returned by trigger). No-op otherwise.
create or replace function public.release_pending_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.orders
    set status = 'cancelled'
    where id = p_order_id and status = 'pending' and payment_status = 'pending';
  get diagnostics v_updated = row_count;
  -- Stock is returned by the orders_restock_on_cancel trigger.
  return v_updated > 0;
end;
$$;

-- Applies a verified Stripe event to an order exactly once.
--   * The event id is recorded in webhook_events in the same transaction, so a
--     redelivered event is detected and skipped ("duplicate").
--   * State transitions are guarded (pending -> paid only), so even two distinct
--     events for the same session cannot double-fulfil an order.
--   * If anything fails the whole transaction (including the ledger row) rolls
--     back and Stripe's retry will process the event again.
-- Returns: processed | duplicate | ignored | amount_mismatch | order_not_found
create or replace function public.apply_checkout_event(
  p_event_id text,
  p_event_type text,
  p_order_id uuid,
  p_session_id text,
  p_payment_intent_id text,
  p_amount_total integer,
  p_currency text,
  p_outcome text -- 'paid' | 'failed' | 'expired'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_result text;
begin
  insert into public.webhook_events (id, type, order_id, outcome)
  values (p_event_id, p_event_type, null, 'processing')
  on conflict (id) do nothing;

  if not found then
    return 'duplicate';
  end if;

  select * into v_order from public.orders
  where id = p_order_id
    and (stripe_checkout_session_id is null or stripe_checkout_session_id = p_session_id)
  for update;

  if not found then
    v_result := 'order_not_found';
  elsif p_outcome = 'paid' then
    if v_order.payment_status = 'paid' then
      v_result := 'ignored';
    elsif v_order.status <> 'pending' then
      -- Paid after the order was cancelled (e.g. session expired race). Record
      -- the payment so an operator can refund; do not fulfil automatically.
      update public.orders
        set payment_status = 'paid', paid_at = now(),
            stripe_payment_intent_id = coalesce(nullif(p_payment_intent_id, ''), stripe_payment_intent_id),
            stripe_checkout_session_id = p_session_id
        where id = v_order.id;
      v_result := 'paid_after_cancel';
    elsif p_amount_total is distinct from v_order.total_cents or lower(p_currency) <> v_order.currency then
      v_result := 'amount_mismatch';
    else
      update public.orders
        set status = 'paid', payment_status = 'paid', paid_at = now(),
            stripe_payment_intent_id = coalesce(nullif(p_payment_intent_id, ''), stripe_payment_intent_id),
            stripe_checkout_session_id = p_session_id
        where id = v_order.id;
      v_result := 'processed';
    end if;
  elsif p_outcome in ('failed', 'expired') then
    if v_order.status = 'pending' and v_order.payment_status = 'pending' then
      perform public.release_pending_order(v_order.id);
      if p_outcome = 'failed' then
        update public.orders set payment_status = 'failed' where id = v_order.id;
      end if;
      v_result := 'processed';
    else
      v_result := 'ignored';
    end if;
  else
    v_result := 'ignored';
  end if;

  update public.webhook_events
    set outcome = v_result, order_id = v_order.id
    where id = p_event_id;

  return v_result;
end;
$$;

-- Lock down: these functions bypass RLS and must only be callable by the server.
revoke execute on function public.create_order(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.release_pending_order(uuid) from public, anon, authenticated;
revoke execute on function public.apply_checkout_event(text, text, uuid, text, text, integer, text, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.create_order(uuid, text, jsonb) to service_role;
grant execute on function public.release_pending_order(uuid) to service_role;
grant execute on function public.apply_checkout_event(text, text, uuid, text, text, integer, text, text) to service_role;
