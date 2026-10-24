-- Phase 03 catalogue: save/archive products and categories, barcodes, aliases, search, price history,
-- quota, cost masking, cross-tenant references, cashier restrictions.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;

insert into auth.users (id, phone, phone_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000c0a1', '919300000001', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c0b1', '919300000002', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c0c1', '919300000003', now(), 'authenticated', 'authenticated');

-- Shop A (owner A, cashier C) and shop B (owner B)
select pg_temp.login('00000000-0000-0000-0000-00000000c0a1');
insert into ctx select 'shopA', public.create_shop('{"clientOperationId":"77777777-7777-7777-8777-777777777771","name":"Cat Shop A","businessCategory":"kirana"}') ->> 'shopId';
insert into ctx select 'inv', public.invite_shop_member((select v::uuid from ctx where k = 'shopA'), 'cashier', '+919300000003') ->> 'invitationId';
select pg_temp.login('00000000-0000-0000-0000-00000000c0c1');
select public.accept_shop_invitation((select v::uuid from ctx where k = 'inv'));
select pg_temp.login('00000000-0000-0000-0000-00000000c0b1');
insert into ctx select 'shopB', public.create_shop('{"clientOperationId":"77777777-7777-7777-8777-777777777772","name":"Cat Shop B","businessCategory":"general"}') ->> 'shopId';
insert into ctx select 'catB', public.save_category((select v::uuid from ctx where k = 'shopB'), null, 'Shop B Only') ->> 'id';

-- Owner A builds a catalogue
select pg_temp.login('00000000-0000-0000-0000-00000000c0a1');
insert into ctx select 'catA', public.save_category((select v::uuid from ctx where k = 'shopA'), null, 'Grocery', 'किराना') ->> 'id';

-- 1..2 categories
select ok((select v from ctx where k = 'catA') is not null, 'owner creates a category');
select throws_ok($$ select public.save_category((select v::uuid from ctx where k = 'shopA'), null, 'grocery') $$,
                 'P0001', 'DS_CONFLICT', 'category names are unique per shop, case-insensitive');

-- 3..7 products
select is(public.save_product((select v::uuid from ctx where k = 'shopA'), jsonb_build_object(
  'id', '0190f0f0-0000-7000-8000-00000000a001', 'name', 'Sugar 1kg', 'nameHi', 'चीनी', 'categoryId', (select v from ctx where k = 'catA'),
  'unitCode', 'pc', 'pricePaise', 4500, 'barcodes', jsonb_build_array('8901234567890'), 'aliases', jsonb_build_array('cheeni', 'shakkar'))) ->> 'name',
  'Sugar 1kg', 'owner creates a product with barcode and aliases');
select is(public.save_product((select v::uuid from ctx where k = 'shopA'), jsonb_build_object(
  'id', '0190f0f0-0000-7000-8000-00000000a001', 'name', 'Sugar 1kg', 'nameHi', 'चीनी', 'unitCode', 'pc', 'pricePaise', 4800,
  'barcodes', jsonb_build_array('8901234567890'), 'aliases', jsonb_build_array('cheeni'))) ->> 'pricePaise',
  '4800', 'saving the same id updates the product (idempotent create)');
select is((select count(*) from public.product_price_history where product_id = '0190f0f0-0000-7000-8000-00000000a001')::int, 2,
          'price changes are recorded in price history');
select throws_ok($$ select public.save_product((select v::uuid from ctx where k = 'shopA'), jsonb_build_object(
  'id', '0190f0f0-0000-7000-8000-00000000a002', 'name', 'Other', 'pricePaise', 100, 'barcodes', jsonb_build_array('8901234567890'))) $$,
  'P0001', 'DS_CONFLICT', 'a barcode belongs to one product per shop');
select throws_ok($$ select public.save_product((select v::uuid from ctx where k = 'shopA'), jsonb_build_object(
  'id', '0190f0f0-0000-7000-8000-00000000a003', 'name', 'Sneaky', 'pricePaise', 100, 'categoryId', (select v from ctx where k = 'catB'))) $$,
  'P0001', 'DS_VALIDATION_FAILED', 'a category of another shop cannot be used');

-- 8..12 search
select is(public.search_products((select v::uuid from ctx where k = 'shopA'), 'cheeni') -> 'items' -> 0 ->> 'name', 'Sugar 1kg',
          'search matches an alias');
select is(public.search_products((select v::uuid from ctx where k = 'shopA'), 'चीनी') -> 'items' -> 0 ->> 'name', 'Sugar 1kg',
          'search matches the Hindi name');
select is(public.search_products((select v::uuid from ctx where k = 'shopA'), '8901234567890') -> 'items' -> 0 ->> 'name', 'Sugar 1kg',
          'search matches an exact barcode');
select is(jsonb_array_length(public.search_products((select v::uuid from ctx where k = 'shopA'), 'shakkar') -> 'items'), 0,
          'removed aliases no longer match');
select ok((public.search_products((select v::uuid from ctx where k = 'shopA'), null) -> 'items' -> 0 -> 'lastCostPaise') = 'null'::jsonb,
          'owner sees the cost field (null until a purchase sets it)');

-- 13..17 cashier
select pg_temp.login('00000000-0000-0000-0000-00000000c0c1');
select is(jsonb_array_length(public.search_products((select v::uuid from ctx where k = 'shopA'), 'sugar') -> 'items'), 1,
          'cashier can search the catalogue');
select ok(not (public.search_products((select v::uuid from ctx where k = 'shopA'), 'sugar') -> 'items' -> 0 ? 'lastCostPaise')
          or (public.search_products((select v::uuid from ctx where k = 'shopA'), 'sugar') -> 'items' -> 0 -> 'lastCostPaise') = 'null'::jsonb,
          'cashier never receives a cost value');
select throws_ok($$ select public.save_product((select v::uuid from ctx where k = 'shopA'), '{"id":"0190f0f0-0000-7000-8000-00000000a009","name":"X","pricePaise":1}') $$,
                 'P0001', 'DS_PERMISSION_DENIED', 'cashier cannot create products');
select throws_ok($$ select last_cost_paise from public.products $$, '42501', null,
                 'the cost column is not readable directly');
select throws_ok($$ update public.products set price_paise = 1 $$, '42501', null, 'products cannot be updated directly');

-- 18 other tenant
select pg_temp.login('00000000-0000-0000-0000-00000000c0b1');
select throws_ok($$ select public.search_products((select v::uuid from ctx where k = 'shopA'), 'sugar') $$,
                 'P0001', 'DS_NOT_A_MEMBER', 'another shop cannot search shop A');

-- 19..20 archive
select pg_temp.login('00000000-0000-0000-0000-00000000c0a1');
select public.archive_product((select v::uuid from ctx where k = 'shopA'), '0190f0f0-0000-7000-8000-00000000a001');
select is(jsonb_array_length(public.search_products((select v::uuid from ctx where k = 'shopA'), 'sugar') -> 'items'), 0,
          'archived products disappear from search');
select ok((public.save_product((select v::uuid from ctx where k = 'shopA'), jsonb_build_object(
  'id', '0190f0f0-0000-7000-8000-00000000a004', 'name', 'Sugar 1kg new', 'pricePaise', 5000,
  'barcodes', jsonb_build_array('8901234567890'))) -> 'barcodes') ? '8901234567890',
  'an archived product frees its barcode');

-- 21..22 quota
reset role;
insert into public.shop_entitlement_overrides (shop_id, entitlement_key, value, reason)
values ((select v::uuid from ctx where k = 'shopA'), 'products.max', '1', 'test: one product');
select pg_temp.login('00000000-0000-0000-0000-00000000c0a1');
select throws_ok($$ select public.save_product((select v::uuid from ctx where k = 'shopA'),
                    '{"id":"0190f0f0-0000-7000-8000-00000000a005","name":"Second","pricePaise":100}') $$,
                 'P0001', 'DS_QUOTA_EXCEEDED', 'product limit is enforced on the server');
select is((select count(*) from public.units)::int, 9, 'units reference data is readable');

reset role;
select * from finish();
rollback;
