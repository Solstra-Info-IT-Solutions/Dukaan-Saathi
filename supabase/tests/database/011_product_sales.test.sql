-- Phase 05: product lines (quantities, loose items, price overrides, line discounts, GST), stock movements,
-- void_sale, list_sales.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;
create function pg_temp.ctx(p_k text) returns text language sql as $$ select v from ctx where k = p_k $$;

-- A bill with explicit lines and client totals, paid in cash (no payment when the total is 0).
create function pg_temp.sale(p_shop text, p_device text, p_seq int, p_op text, p_lines jsonb,
                             p_subtotal bigint, p_discount bigint, p_tax bigint, p_total bigint, p_bill_discount bigint default 0)
returns jsonb language sql as $$
  select jsonb_build_object(
    'clientOperationId', p_op, 'shopId', pg_temp.ctx(p_shop), 'deviceId', pg_temp.ctx(p_device),
    'invoice', jsonb_build_object('fy', pg_temp.ctx('fy'), 'seq', p_seq), 'occurredAt', now(), 'origin', 'online',
    'lines', p_lines, 'billDiscountPaise', p_bill_discount,
    'payments', case when p_total > 0 then jsonb_build_array(jsonb_build_object('method', 'cash', 'amountPaise', p_total))
                     else '[]'::jsonb end,
    'clientTotals', jsonb_build_object('subtotalPaise', p_subtotal, 'discountPaise', p_discount, 'taxPaise', p_tax,
                                       'roundOffPaise', 0, 'totalPaise', p_total))
$$;
create function pg_temp.line(p_product text, p_qty bigint, p_price bigint, p_override boolean default false,
                             p_discount bigint default 0)
returns jsonb language sql as $$
  select jsonb_build_object('kind', 'product', 'productId', pg_temp.ctx(p_product), 'quantityMilli', p_qty,
                            'unitPricePaise', p_price, 'priceOverride', p_override, 'lineDiscountPaise', p_discount)
$$;
create function pg_temp.void(p_sale text, p_op text, p_reason text default 'Customer returned everything')
returns jsonb language sql as $$
  select public.void_sale(jsonb_build_object('clientOperationId', p_op, 'shopId', pg_temp.ctx('shopA'),
                                             'saleId', pg_temp.ctx(p_sale)::jsonb ->> 'saleId', 'reason', p_reason))
$$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users (id, phone, phone_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000f5a1', '919400000011', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f5b1', '919400000012', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f5c1', '919400000013', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f5d1', '919400000014', now(), 'authenticated', 'authenticated');
insert into ctx values ('fy', private.financial_year(now(), 'Asia/Kolkata'));

-- Shop A: owner (device A), cashier C (device C), manager M (device M). Shop B: owner B with one product.
select pg_temp.login('00000000-0000-0000-0000-00000000f5a1');
insert into ctx select 'shopA', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-8888888885a1","name":"Product Shop A","businessCategory":"kirana"}') ->> 'shopId';
insert into ctx select 'devA', public.register_device(pg_temp.ctx('shopA')::uuid, 'eeeeeeee-0000-4000-8000-0000000005a1', 'android') ->> 'deviceId';
insert into ctx select 'invC', public.invite_shop_member(pg_temp.ctx('shopA')::uuid, 'cashier', '+919400000013') ->> 'invitationId';
insert into ctx select 'invM', public.invite_shop_member(pg_temp.ctx('shopA')::uuid, 'manager', '+919400000014') ->> 'invitationId';
select public.save_product(pg_temp.ctx('shopA')::uuid, jsonb_build_object('id', '0190f0f0-0000-7000-8000-0000000f5001',
  'name', 'Sugar 1kg', 'unitCode', 'pc', 'pricePaise', 4500, 'trackStock', true, 'barcodes', '[]'::jsonb, 'aliases', '[]'::jsonb));
select public.save_product(pg_temp.ctx('shopA')::uuid, jsonb_build_object('id', '0190f0f0-0000-7000-8000-0000000f5002',
  'name', 'Pyaaz', 'unitCode', 'kg', 'pricePaise', 4000, 'barcodes', '[]'::jsonb, 'aliases', '[]'::jsonb));
select public.save_product(pg_temp.ctx('shopA')::uuid, jsonb_build_object('id', '0190f0f0-0000-7000-8000-0000000f5003',
  'name', 'Old Soap', 'unitCode', 'pc', 'pricePaise', 2000, 'barcodes', '[]'::jsonb, 'aliases', '[]'::jsonb));
select public.archive_product(pg_temp.ctx('shopA')::uuid, '0190f0f0-0000-7000-8000-0000000f5003');
insert into ctx values ('sugar', '0190f0f0-0000-7000-8000-0000000f5001'), ('pyaaz', '0190f0f0-0000-7000-8000-0000000f5002'),
                       ('soap', '0190f0f0-0000-7000-8000-0000000f5003'), ('foreign', '0190f0f0-0000-7000-8000-0000000f5004');
select pg_temp.login('00000000-0000-0000-0000-00000000f5c1');
select public.accept_shop_invitation(pg_temp.ctx('invC')::uuid);
insert into ctx select 'devC', public.register_device(pg_temp.ctx('shopA')::uuid, 'eeeeeeee-0000-4000-8000-0000000005c1', 'android') ->> 'deviceId';
select pg_temp.login('00000000-0000-0000-0000-00000000f5d1');
select public.accept_shop_invitation(pg_temp.ctx('invM')::uuid);
insert into ctx select 'devM', public.register_device(pg_temp.ctx('shopA')::uuid, 'eeeeeeee-0000-4000-8000-0000000005d1', 'android') ->> 'deviceId';
select pg_temp.login('00000000-0000-0000-0000-00000000f5b1');
insert into ctx select 'shopB', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-8888888885b1","name":"Product Shop B","businessCategory":"general"}') ->> 'shopId';
select public.save_product(pg_temp.ctx('shopB')::uuid, jsonb_build_object('id', '0190f0f0-0000-7000-8000-0000000f5004',
  'name', 'B only', 'unitCode', 'pc', 'pricePaise', 100, 'barcodes', '[]'::jsonb, 'aliases', '[]'::jsonb));
reset role;
update public.products set stock_on_hand_milli = 10000 where id = '0190f0f0-0000-7000-8000-0000000f5001';

-- 1..4 product lines and stock
select pg_temp.login('00000000-0000-0000-0000-00000000f5a1');
insert into ctx select 's1', public.create_sale(pg_temp.sale('shopA', 'devA', 1, '0190f0f0-0000-7000-8000-0000000f5101',
  jsonb_build_array(pg_temp.line('sugar', 2000, 4500), pg_temp.line('pyaaz', 250, 4000)), 10000, 0, 0, 10000))::text;
select is(pg_temp.ctx('s1')::jsonb -> 'totals' ->> 'totalPaise', '10000', '2 × ₹45 sugar + 250 g onion at ₹40/kg = ₹100');
select is((select string_agg(label || ':' || quantity_milli || ':' || gross_paise || ':' || coalesce(unit_code, '-'), ',' order by line_no)
             from public.sale_items where sale_id = (pg_temp.ctx('s1')::jsonb ->> 'saleId')::uuid),
          'Sugar 1kg:2000:9000:pc,Pyaaz:250:1000:kg', 'lines keep name, unit and quantity snapshots');
select is((select stock_on_hand_milli from public.products where id = pg_temp.ctx('sugar')::uuid), 8000::bigint,
          'stock of a tracked product goes down');
select is((select quantity_milli from public.stock_movements where sale_id = (pg_temp.ctx('s1')::jsonb ->> 'saleId')::uuid),
          -2000::bigint, 'one sale movement for the tracked product only');

-- 5..10 validation and price policy
select throws_ok($$ select public.create_sale(pg_temp.sale('shopA', 'devA', 2, '0190f0f0-0000-7000-8000-0000000f5102',
  jsonb_build_array(pg_temp.line('sugar', 1500, 4500)), 6750, 0, 0, 6750)) $$,
  'P0001', 'DS_VALIDATION_FAILED', 'a piece item cannot be sold in fractions');
select throws_ok($$ select public.create_sale(pg_temp.sale('shopA', 'devA', 2, '0190f0f0-0000-7000-8000-0000000f5103',
  jsonb_build_array(pg_temp.line('sugar', 1000, 4000)), 4000, 0, 0, 4000)) $$,
  'P0001', 'DS_TOTAL_MISMATCH', 'an old price without an override is a mismatch (price changed)');
select throws_ok($$ select public.create_sale(pg_temp.sale('shopA', 'devA', 2, '0190f0f0-0000-7000-8000-0000000f5104',
  jsonb_build_array(pg_temp.line('sugar', 1000, 4000, true)), 4000, 0, 0, 4000)) $$,
  'P0001', 'DS_PRICE_OVERRIDE_DENIED', 'price overrides are refused while the shop does not allow them');
select throws_ok($$ select public.create_sale(pg_temp.sale('shopA', 'devA', 2, '0190f0f0-0000-7000-8000-0000000f5105',
  jsonb_build_array(pg_temp.line('soap', 1000, 2000)), 2000, 0, 0, 2000)) $$,
  'P0001', 'DS_PRODUCT_INACTIVE', 'an archived product cannot be sold');
select throws_ok($$ select public.create_sale(pg_temp.sale('shopA', 'devA', 2, '0190f0f0-0000-7000-8000-0000000f5106',
  jsonb_build_array(pg_temp.line('foreign', 1000, 100)), 100, 0, 0, 100)) $$,
  'P0001', 'DS_VALIDATION_FAILED', 'a product of another shop is rejected');
select public.update_shop_settings(pg_temp.ctx('shopA')::uuid, '{"priceOverrideAllowed":true}');
insert into ctx select 's2', public.create_sale(pg_temp.sale('shopA', 'devA', 2, '0190f0f0-0000-7000-8000-0000000f5107',
  jsonb_build_array(pg_temp.line('sugar', 1000, 4000, true)), 4000, 0, 0, 4000))::text;
select is((select price_overridden from public.sale_items where sale_id = (pg_temp.ctx('s2')::jsonb ->> 'saleId')::uuid), true,
          'the owner can override a price once the shop allows it');

-- 11..13 override audit, cashier limits
reset role;
select ok(exists (select 1 from audit.events where action = 'sale.price_override'
                   and entity_id = pg_temp.ctx('s2')::jsonb ->> 'saleId'), 'price overrides are audited');
select pg_temp.login('00000000-0000-0000-0000-00000000f5c1');
select throws_ok($$ select public.create_sale(pg_temp.sale('shopA', 'devC', 1, '0190f0f0-0000-7000-8000-0000000f5108',
  jsonb_build_array(pg_temp.line('sugar', 1000, 4000, true)), 4000, 0, 0, 4000)) $$,
  'P0001', 'DS_PRICE_OVERRIDE_DENIED', 'a cashier cannot override prices');
select throws_ok($$ select public.create_sale(pg_temp.sale('shopA', 'devC', 1, '0190f0f0-0000-7000-8000-0000000f5109',
  jsonb_build_array(pg_temp.line('sugar', 1000, 4500, false, 500)), 4500, 500, 0, 4000)) $$,
  'P0001', 'DS_DISCOUNT_LIMIT_EXCEEDED', 'a cashier line discount above the limit is refused');

-- 14..16 stock policies
insert into ctx select 'sC', public.create_sale(pg_temp.sale('shopA', 'devC', 1, '0190f0f0-0000-7000-8000-0000000f5110',
  jsonb_build_array(pg_temp.line('sugar', 9000, 4500)), 40500, 0, 0, 40500))::text;
select is(pg_temp.ctx('sC')::jsonb -> 'warnings' -> 0 ->> 'code', 'NEGATIVE_STOCK',
          'selling more than in stock warns by default');
select pg_temp.login('00000000-0000-0000-0000-00000000f5a1');
select public.update_shop_settings(pg_temp.ctx('shopA')::uuid, '{"negativeStockPolicy":"block"}');
select throws_ok($$ select public.create_sale(pg_temp.sale('shopA', 'devA', 3, '0190f0f0-0000-7000-8000-0000000f5111',
  jsonb_build_array(pg_temp.line('sugar', 1000, 4500)), 4500, 0, 0, 4500)) $$,
  'P0001', 'DS_INSUFFICIENT_STOCK', 'the block policy refuses a sale beyond stock');
select is((select stock_on_hand_milli from public.products where id = pg_temp.ctx('sugar')::uuid), -2000::bigint,
          'stock after the warned sale is -2 and the refused sale changed nothing');

-- 17 GST
select public.update_shop_settings(pg_temp.ctx('shopA')::uuid,
  '{"taxMode":"gst_regular","gstin":"08ABCDE1234F1Z5","negativeStockPolicy":"allow"}');
select public.save_product(pg_temp.ctx('shopA')::uuid, jsonb_build_object('id', '0190f0f0-0000-7000-8000-0000000f5005',
  'name', 'Shampoo', 'unitCode', 'pc', 'pricePaise', 11800, 'taxRateCode', 'GST_18', 'hsnCode', '3305',
  'barcodes', '[]'::jsonb, 'aliases', '[]'::jsonb));
insert into ctx values ('shampoo', '0190f0f0-0000-7000-8000-0000000f5005');
insert into ctx select 's3', public.create_sale(pg_temp.sale('shopA', 'devA', 3, '0190f0f0-0000-7000-8000-0000000f5112',
  jsonb_build_array(pg_temp.line('shampoo', 1000, 11800)), 11800, 0, 1800, 11800))::text;
select is((select tax_rate_bp || ':' || tax_paise || ':' || hsn_code from public.sale_items
            where sale_id = (pg_temp.ctx('s3')::jsonb ->> 'saleId')::uuid), '1800:1800:3305',
          'GST 18 % inside ₹118 is ₹18; rate and HSN are kept on the line');

-- 18..23 void
select pg_temp.login('00000000-0000-0000-0000-00000000f5c1');
select throws_ok($$ select pg_temp.void('sC', '0190f0f0-0000-7000-8000-0000000f5201') $$,
  'P0001', 'DS_PERMISSION_DENIED', 'a cashier cannot void');
select pg_temp.login('00000000-0000-0000-0000-00000000f5a1');
insert into ctx select 'v1', pg_temp.void('s1', '0190f0f0-0000-7000-8000-0000000f5202')::text;
select is(pg_temp.ctx('v1')::jsonb ->> 'status', 'voided', 'the owner voids a bill');
select is((select stock_on_hand_milli from public.products where id = pg_temp.ctx('sugar')::uuid), 0::bigint,
          'voiding gives the stock back');
select is((select count(*) from public.sale_items where sale_id = (pg_temp.ctx('s1')::jsonb ->> 'saleId')::uuid)::int, 2,
          'nothing is deleted: the voided bill keeps its lines');
select is(pg_temp.void('s1', '0190f0f0-0000-7000-8000-0000000f5202') ->> 'replayed', 'true',
          'repeating the same void request replays it');
select throws_ok($$ select pg_temp.void('s1', '0190f0f0-0000-7000-8000-0000000f5203') $$,
  'P0001', 'DS_SALE_ALREADY_VOIDED', 'a bill cannot be voided twice');

-- 24..25 manager void window
reset role;
update public.sales set created_at = now() - interval '2 hours' where id = (pg_temp.ctx('s2')::jsonb ->> 'saleId')::uuid;
select pg_temp.login('00000000-0000-0000-0000-00000000f5a1');
select public.update_shop_settings(pg_temp.ctx('shopA')::uuid, '{"voidWindowMinutes":60}');
select pg_temp.login('00000000-0000-0000-0000-00000000f5d1');
select throws_ok($$ select pg_temp.void('s2', '0190f0f0-0000-7000-8000-0000000f5204') $$,
  'P0001', 'DS_VOID_WINDOW_EXPIRED', 'a manager cannot void after the void window');
select is(pg_temp.void('s3', '0190f0f0-0000-7000-8000-0000000f5205') ->> 'status', 'voided',
          'a manager can void within the window');

-- 26..30 history
select pg_temp.login('00000000-0000-0000-0000-00000000f5a1');
select is(jsonb_array_length(public.list_sales(pg_temp.ctx('shopA')::uuid) -> 'items'), 4, 'the owner lists every bill');
select is((select jsonb_array_length(p1 -> 'items') + jsonb_array_length(
             public.list_sales(pg_temp.ctx('shopA')::uuid, p_cursor => p1 ->> 'nextCursor', p_limit => 3) -> 'items')
             from public.list_sales(pg_temp.ctx('shopA')::uuid, p_limit => 3) p1), 4,
          'paging with the cursor returns every bill once');
select is(public.list_sales(pg_temp.ctx('shopA')::uuid, p_query => 'pyaaz') -> 'items' -> 0 ->> 'saleId',
          pg_temp.ctx('s1')::jsonb ->> 'saleId', 'history can be searched by item name');
select is(jsonb_array_length(public.list_sales(pg_temp.ctx('shopA')::uuid, p_status => 'voided') -> 'items'), 2,
          'history can be filtered to voided bills');
select pg_temp.login('00000000-0000-0000-0000-00000000f5c1');
select is(jsonb_array_length(public.list_sales(pg_temp.ctx('shopA')::uuid) -> 'items'), 1,
          'a cashier lists only their own bills');

select * from finish();
rollback;
