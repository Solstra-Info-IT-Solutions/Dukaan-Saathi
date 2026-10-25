-- Phase 07: stock adjustments, stock counts, low-stock list, drift check, suppliers + ledger, purchases,
-- supplier payments, cash paid to suppliers in day close.
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
create function pg_temp.adjust(p_op text, p_product text, p_delta bigint, p_reason text default 'damage')
returns jsonb language sql as $$
  select public.adjust_stock(jsonb_build_object('clientOperationId', p_op, 'shopId', pg_temp.ctx('shopA'),
    'productId', pg_temp.ctx(p_product), 'deltaMilli', p_delta, 'reason', p_reason))
$$;
create function pg_temp.stock(p_product text) returns bigint language sql as $$
  select stock_on_hand_milli from public.products where id = pg_temp.ctx(p_product)::uuid
$$;
create function pg_temp.purchase(p_op text, p_supplier text, p_lines jsonb, p_payments jsonb, p_extra jsonb default '{}')
returns jsonb language sql as $$
  select public.receive_purchase(jsonb_build_object('clientOperationId', p_op, 'shopId', pg_temp.ctx('shopA'),
    'deviceId', pg_temp.ctx('devA'), 'lines', p_lines, 'payments', p_payments)
    || case when p_supplier is null then '{}'::jsonb else jsonb_build_object('supplierId', pg_temp.ctx(p_supplier)) end
    || p_extra)
$$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users (id, phone, phone_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000008a1', '919400000081', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000008b1', '919400000082', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000008c1', '919400000083', now(), 'authenticated', 'authenticated');
insert into ctx values ('atta', '0190f0f0-0000-7000-8000-0000000008e1'), ('soap', '0190f0f0-0000-7000-8000-0000000008e2'),
                       ('salt', '0190f0f0-0000-7000-8000-0000000008e3'), ('gupta', '0190f0f0-0000-7000-8000-0000000008f1');

select pg_temp.login('00000000-0000-0000-0000-0000000008a1');
insert into ctx select 'shopA', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-8888888888a1","name":"Stock Shop A","businessCategory":"kirana"}') ->> 'shopId';
insert into ctx select 'devA', public.register_device(pg_temp.ctx('shopA')::uuid, 'eeeeeeee-0000-4000-8000-0000000008a1', 'android') ->> 'deviceId';
insert into ctx select 'invC', public.invite_shop_member(pg_temp.ctx('shopA')::uuid, 'cashier', '+919400000083') ->> 'invitationId';
select public.save_product(pg_temp.ctx('shopA')::uuid, jsonb_build_object('id', pg_temp.ctx('atta'), 'name', 'Atta',
  'unitCode', 'kg', 'pricePaise', 5000, 'trackStock', true, 'lowStockThresholdMilli', 5000, 'barcodes', '[]'::jsonb, 'aliases', '[]'::jsonb));
select public.save_product(pg_temp.ctx('shopA')::uuid, jsonb_build_object('id', pg_temp.ctx('soap'), 'name', 'Soap',
  'unitCode', 'pc', 'pricePaise', 3000, 'trackStock', true, 'lowStockThresholdMilli', 2000, 'barcodes', '[]'::jsonb, 'aliases', '[]'::jsonb));
select public.save_product(pg_temp.ctx('shopA')::uuid, jsonb_build_object('id', pg_temp.ctx('salt'), 'name', 'Salt',
  'unitCode', 'pc', 'pricePaise', 2000, 'barcodes', '[]'::jsonb, 'aliases', '[]'::jsonb));
select pg_temp.login('00000000-0000-0000-0000-0000000008c1');
select public.accept_shop_invitation(pg_temp.ctx('invC')::uuid);
select pg_temp.login('00000000-0000-0000-0000-0000000008b1');
insert into ctx select 'shopB', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-8888888888b1","name":"Stock Shop B","businessCategory":"general"}') ->> 'shopId';

-- 1..5 adjustments
select pg_temp.login('00000000-0000-0000-0000-0000000008a1');
select is(pg_temp.adjust('0190f0f0-0000-7000-8000-000000080001', 'atta', 10000, 'opening') ->> 'stockOnHandMilli', '10000',
          'opening stock of 10 kg');
select is((select kind from public.stock_movements where product_id = pg_temp.ctx('atta')::uuid), 'opening',
          'opening stock is an "opening" movement');
select throws_ok($$ select pg_temp.adjust('0190f0f0-0000-7000-8000-000000080002', 'salt', 1000) $$,
  'P0001', 'DS_VALIDATION_FAILED', 'products that do not track stock cannot be adjusted');
select throws_ok($$ select pg_temp.adjust('0190f0f0-0000-7000-8000-000000080003', 'soap', 1500) $$,
  'P0001', 'DS_VALIDATION_FAILED', 'piece items move in whole units');
select is(pg_temp.adjust('0190f0f0-0000-7000-8000-000000080001', 'atta', 10000, 'opening') ->> 'replayed', 'true',
          'repeating an adjustment replays it');

-- 6..9 stock count and low stock
insert into ctx select 'count', public.submit_stock_count(jsonb_build_object('clientOperationId', '0190f0f0-0000-7000-8000-000000080004',
  'shopId', pg_temp.ctx('shopA'), 'counts', jsonb_build_array(
    jsonb_build_object('productId', pg_temp.ctx('atta'), 'countedMilli', 9500),
    jsonb_build_object('productId', pg_temp.ctx('soap'), 'countedMilli', 3000))))::text;
select is((select jsonb_agg(i ->> 'deltaMilli' order by i ->> 'countedMilli') from jsonb_array_elements(pg_temp.ctx('count')::jsonb -> 'items') i),
          '["3000", "-500"]'::jsonb, 'a count adjusts each product by counted − on hand');
select is(pg_temp.stock('atta') || '/' || pg_temp.stock('soap'), '9500/3000', 'stock equals the counted quantities');
select pg_temp.adjust('0190f0f0-0000-7000-8000-000000080005', 'soap', -2000);
select is((select jsonb_agg(x ->> 'name') from jsonb_array_elements(public.list_stock(pg_temp.ctx('shopA')::uuid, true)) x),
          '["Soap"]'::jsonb, 'low-stock list: soap at 1 is at or below its threshold of 2; atta at 9.5 kg is above 5');
select is(jsonb_array_length(public.list_stock(pg_temp.ctx('shopA')::uuid)), 2, 'stock list shows only tracked items');

-- 10..13 suppliers
select is(public.save_supplier(jsonb_build_object('id', pg_temp.ctx('gupta'), 'shopId', pg_temp.ctx('shopA'),
  'name', 'Gupta Traders', 'phone', '+919811111111', 'openingBalancePaise', 50000)) ->> 'balancePaise', '50000',
  'a supplier starts with its opening balance');
select is(public.save_supplier(jsonb_build_object('id', pg_temp.ctx('gupta'), 'shopId', pg_temp.ctx('shopA'),
  'name', 'Gupta Traders Ajmer', 'openingBalancePaise', 99999)) ->> 'balancePaise', '50000',
  'editing a supplier never changes its balance');
select throws_ok($$ select public.save_supplier(jsonb_build_object('id', '0190f0f0-0000-7000-8000-0000000008f2',
  'shopId', pg_temp.ctx('shopA'), 'name', 'gupta traders ajmer')) $$,
  'P0001', 'DS_CONFLICT', 'supplier names are unique per shop');
select pg_temp.login('00000000-0000-0000-0000-0000000008c1');
select throws_ok($$ select public.save_supplier(jsonb_build_object('id', '0190f0f0-0000-7000-8000-0000000008f3',
  'shopId', pg_temp.ctx('shopA'), 'name', 'Cashier Supplier')) $$,
  'P0001', 'DS_PERMISSION_DENIED', 'a cashier cannot manage suppliers');

-- 14..20 purchase: 10 kg atta @ ₹40 + 12 soap @ ₹25 = ₹700, ₹200 paid in cash, soap price → ₹32
select pg_temp.login('00000000-0000-0000-0000-0000000008a1');
insert into ctx select 'p1', pg_temp.purchase('0190f0f0-0000-7000-8000-000000080101', 'gupta',
  jsonb_build_array(jsonb_build_object('productId', pg_temp.ctx('atta'), 'quantityMilli', 10000, 'unitCostPaise', 4000),
                    jsonb_build_object('productId', pg_temp.ctx('soap'), 'quantityMilli', 12000, 'unitCostPaise', 2500)),
  '[{"method":"cash","amountPaise":20000}]',
  jsonb_build_object('supplierInvoiceNo', 'GT-77', 'priceUpdates', jsonb_build_array(jsonb_build_object('productId', pg_temp.ctx('soap'), 'pricePaise', 3200))))::text;
select is(pg_temp.ctx('p1')::jsonb - 'purchaseId', '{"totalPaise": 70000, "paidPaise": 20000, "supplierBalancePaise": 100000, "replayed": false}'::jsonb,
          'a purchase adds the total and subtracts the payment from the supplier balance (500 + 700 − 200)');
select is(pg_temp.stock('atta') || '/' || pg_temp.stock('soap'), '19500/13000', 'received quantities are added to stock');
reset role; -- cost prices are not readable by clients
select is((select last_cost_paise || '/' || price_paise from public.products where id = pg_temp.ctx('soap')::uuid), '2500/3200',
          'cost price and the new selling price are updated');
select pg_temp.login('00000000-0000-0000-0000-0000000008a1');
select ok(exists (select 1 from public.product_price_history where product_id = pg_temp.ctx('soap')::uuid and price_paise = 3200),
          'the price change is in the price history');
select is(pg_temp.purchase('0190f0f0-0000-7000-8000-000000080101', 'gupta',
  jsonb_build_array(jsonb_build_object('productId', pg_temp.ctx('atta'), 'quantityMilli', 10000, 'unitCostPaise', 4000),
                    jsonb_build_object('productId', pg_temp.ctx('soap'), 'quantityMilli', 12000, 'unitCostPaise', 2500)),
  '[{"method":"cash","amountPaise":20000}]',
  jsonb_build_object('supplierInvoiceNo', 'GT-77', 'priceUpdates', jsonb_build_array(jsonb_build_object('productId', pg_temp.ctx('soap'), 'pricePaise', 3200))))
  ->> 'replayed', 'true', 'repeating a purchase replays it (no double stock)');
select throws_ok($$ select pg_temp.purchase('0190f0f0-0000-7000-8000-000000080102', null,
  jsonb_build_array(jsonb_build_object('productId', pg_temp.ctx('salt'), 'quantityMilli', 5000, 'unitCostPaise', 1500)),
  '[{"method":"cash","amountPaise":5000}]') $$,
  'P0001', 'DS_VALIDATION_FAILED', 'a purchase without a supplier must be paid in full');
insert into ctx select 'p2', pg_temp.purchase('0190f0f0-0000-7000-8000-000000080103', null,
  jsonb_build_array(jsonb_build_object('productId', pg_temp.ctx('salt'), 'quantityMilli', 5000, 'unitCostPaise', 1500)),
  '[{"method":"cash","amountPaise":7500}]')::text;
select is((select count(*) from public.stock_movements where purchase_id = (pg_temp.ctx('p2')::jsonb ->> 'purchaseId')::uuid)::int, 0,
          'buying an item that does not track stock only updates its cost');

-- 21..23 supplier payments and ledger
select is(public.record_supplier_payment(jsonb_build_object('clientOperationId', '0190f0f0-0000-7000-8000-000000080201',
  'shopId', pg_temp.ctx('shopA'), 'supplierId', pg_temp.ctx('gupta'), 'deviceId', pg_temp.ctx('devA'),
  'amountPaise', 30000, 'method', 'cash')) ->> 'balancePaise', '70000', 'paying a supplier reduces the balance');
select is((select sum(amount_paise)::bigint from public.supplier_ledger_entries where supplier_id = pg_temp.ctx('gupta')::uuid),
          (select balance_paise from public.suppliers where id = pg_temp.ctx('gupta')::uuid),
          'the supplier balance equals the sum of its ledger');
select is((select string_agg(kind || ':' || amount_paise, ',' order by created_at, array_position(array['opening', 'purchase', 'payment'], kind), amount_paise desc)
             from public.supplier_ledger_entries where supplier_id = pg_temp.ctx('gupta')::uuid),
          'opening:50000,purchase:70000,payment:-20000,payment:-30000', 'the ledger shows every change');

-- 24 day close of device A: cash to suppliers = 200 (purchase) + 75 (cash purchase) + 300 (payment)
select is(public.get_day_close(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('devA')::uuid) -> 'breakdown' ->> 'cashSupplierPaymentsPaise',
          '57500', 'day close subtracts cash paid to suppliers from this phone');

-- 25..26 drift check
select is(public.check_stock_drift(pg_temp.ctx('shopA')::uuid), '[]'::jsonb,
          'every stock change is explained by a movement (on hand = sum of movements)');
reset role;
update public.products set stock_on_hand_milli = stock_on_hand_milli + 1000 where id = '0190f0f0-0000-7000-8000-0000000008e2';
select pg_temp.login('00000000-0000-0000-0000-0000000008a1');
select is(public.check_stock_drift(pg_temp.ctx('shopA')::uuid) -> 0 ->> 'name', 'Soap', 'a change outside a movement is detected');

-- 27..30 permissions, entitlement, tenancy
select pg_temp.login('00000000-0000-0000-0000-0000000008c1');
select throws_ok($$ select pg_temp.adjust('0190f0f0-0000-7000-8000-000000080006', 'atta', -1000) $$,
  'P0001', 'DS_PERMISSION_DENIED', 'a cashier cannot adjust stock');
select is((select count(*) from public.purchases where shop_id = pg_temp.ctx('shopA')::uuid)::int, 0,
          'a cashier cannot read purchases');
reset role;
insert into public.shop_entitlement_overrides (shop_id, entitlement_key, value, reason)
values (pg_temp.ctx('shopA')::uuid, 'purchases.enabled', 'false', 'test: plan without purchases');
select pg_temp.login('00000000-0000-0000-0000-0000000008a1');
select throws_ok($$ select pg_temp.purchase('0190f0f0-0000-7000-8000-000000080104', null,
  jsonb_build_array(jsonb_build_object('productId', pg_temp.ctx('salt'), 'quantityMilli', 1000, 'unitCostPaise', 1500)),
  '[{"method":"cash","amountPaise":1500}]') $$,
  'P0001', 'DS_ENTITLEMENT_REQUIRED', 'purchases need the purchases.enabled entitlement');
select pg_temp.login('00000000-0000-0000-0000-0000000008b1');
select is((select count(*) from public.suppliers where shop_id = pg_temp.ctx('shopA')::uuid)::int, 0,
          'shop B cannot read shop A suppliers');

select * from finish();
rollback;
