-- Row Level Security and business-rule tests. Run with: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures: two customers and an admin (profiles are created by trigger)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', '{"full_name":"Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local',   '{"full_name":"Bob"}'),
  ('33333333-3333-3333-3333-333333333333', 'admin@test.local', '{"full_name":"Admin"}');
update public.profiles set role = 'admin' where id = '33333333-3333-3333-3333-333333333333';

select is(
  (select role::text from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'customer', 'new users get the customer role by default');

-- An inactive product and one order per customer (created the server way).
update public.products set is_active = false where slug = 'linea-slim-office-keyboard';

select public.create_order('11111111-1111-1111-1111-111111111111', 'alice@test.local',
  jsonb_build_array(jsonb_build_object('product_id', (select id from public.products where slug = 'glide-ergonomic-wireless-mouse'), 'quantity', 2)));
select public.create_order('22222222-2222-2222-2222-222222222222', 'bob@test.local',
  jsonb_build_array(jsonb_build_object('product_id', (select id from public.products where slug = 'glide-ergonomic-wireless-mouse'), 'quantity', 1)));

select is(
  (select total_cents from public.orders where user_id = '11111111-1111-1111-1111-111111111111'),
  (select price_cents * 2 from public.products where slug = 'glide-ergonomic-wireless-mouse'),
  'create_order computes the total from database prices');

select throws_ok(
  $$ select public.create_order('11111111-1111-1111-1111-111111111111', 'alice@test.local',
       jsonb_build_array(jsonb_build_object('product_id', (select id from public.products where slug = 'prism-rgb-gaming-mouse'), 'quantity', 1))) $$,
  'P0001', null, 'create_order rejects out-of-stock products');

select throws_ok(
  $$ select public.create_order('11111111-1111-1111-1111-111111111111', 'alice@test.local',
       jsonb_build_array(jsonb_build_object('product_id', (select id from public.products where slug = 'bolt-2tb-nvme-ssd'), 'quantity', 1)))
     from generate_series(1, 3) $$,
  'P0001', 'TOO_MANY_PENDING_ORDERS', 'a customer cannot hold more than 3 pending orders (stock-hoarding guard)');

-- ---------------------------------------------------------------------------
-- Anonymous visitors
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select ok((select count(*) from public.products) > 0, 'anon can read active products');
select is((select count(*)::int from public.products where slug = 'linea-slim-office-keyboard'), 0, 'anon cannot see inactive products');
select throws_ok($$ select * from public.orders $$, '42501', null, 'anon has no access to orders');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon has no access to profiles');
select throws_ok($$ select * from public.webhook_events $$, '42501', null, 'anon has no access to webhook_events');

-- ---------------------------------------------------------------------------
-- Customer Alice
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from public.orders), 1, 'customer sees exactly their own order');
select is((select count(*)::int from public.orders where user_id = '22222222-2222-2222-2222-222222222222'), 0,
  'customer cannot read another customer''s orders');
select is((select count(*)::int from public.order_items oi join public.orders o on o.id = oi.order_id
           where o.user_id = '22222222-2222-2222-2222-222222222222'), 0,
  'customer cannot read another customer''s order items');
select is((select count(*)::int from public.profiles), 1, 'customer only sees their own profile');

select throws_ok($$ update public.profiles set role = 'admin' where id = auth.uid() $$, '42501', null,
  'customer cannot promote themselves to admin');
select lives_ok($$ update public.profiles set full_name = 'Alice B' where id = auth.uid() $$,
  'customer can update their own name');
-- Silently affects zero rows under RLS; verified below as admin.
update public.profiles set full_name = 'Hacked' where id = '22222222-2222-2222-2222-222222222222';
update public.products set price_cents = 1;
select is((select count(*)::int from public.profiles where id = '22222222-2222-2222-2222-222222222222'), 0,
  'customer cannot see another customer''s profile');
select throws_ok($$ insert into public.products (category_id, name, slug, price_cents)
                    values ((select id from public.categories limit 1), 'Free', 'free', 1) $$,
  '42501', null, 'customer cannot create products');
select throws_ok($$ insert into public.orders (user_id, customer_email, subtotal_cents, total_cents)
                    values (auth.uid(), 'x@y.z', 0, 0) $$,
  '42501', null, 'customer cannot insert orders directly');
select throws_ok($$ select public.create_order(auth.uid(), 'x@y.z', '[]'::jsonb) $$, '42501', null,
  'customer cannot call create_order');
select throws_ok($$ select public.apply_checkout_event('evt_x', 'checkout.session.completed',
                    (select id from public.orders limit 1), 'cs_x', '', 0, 'brl', 'paid') $$,
  '42501', null, 'customer cannot mark orders as paid');

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is((select count(*)::int from public.orders
           where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')), 2,
  'admin can read every customer''s orders');
select is((select count(*)::int from public.products where slug = 'linea-slim-office-keyboard'), 1, 'admin can see inactive products');
select is((select full_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'), 'Bob',
  'the customer''s update of another profile had no effect');
select is((select count(*)::int from public.products where price_cents = 1), 0,
  'the customer''s price update had no effect');
select lives_ok($$ update public.products set stock_quantity = 99 where slug = 'prism-rgb-gaming-mouse' $$,
  'admin can adjust stock');
select throws_ok(
  $$ update public.orders set status = 'shipped' where user_id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'even admins cannot ship an unpaid order');

-- ---------------------------------------------------------------------------
-- Webhook idempotency (service role, as used by the server)
-- ---------------------------------------------------------------------------
reset role;
select is(
  public.apply_checkout_event('evt_test_1', 'checkout.session.completed',
    (select id from public.orders where user_id = '11111111-1111-1111-1111-111111111111'),
    'cs_test_1', 'pi_1', (select total_cents from public.orders where user_id = '11111111-1111-1111-1111-111111111111'), 'brl', 'paid')
  || '/' ||
  public.apply_checkout_event('evt_test_1', 'checkout.session.completed',
    (select id from public.orders where user_id = '11111111-1111-1111-1111-111111111111'),
    'cs_test_1', 'pi_1', (select total_cents from public.orders where user_id = '11111111-1111-1111-1111-111111111111'), 'brl', 'paid'),
  'processed/duplicate',
  'the same Stripe event is applied only once');

select * from finish();
rollback;
