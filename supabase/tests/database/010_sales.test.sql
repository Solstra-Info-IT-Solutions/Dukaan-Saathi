-- Phase 04 quick bills: create_sale idempotency, invoice sequence, totals parity, payments, discount limits,
-- device checks, cashier visibility, receipts (get_sale), direct-write denial.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;
create function pg_temp.ctx(p_k text) returns text language sql as $$ select v from ctx where k = p_k $$;

-- Quick bill of ₹50 + ₹25 with an optional bill discount, paid in full by one method.
create function pg_temp.bill(p_shop text, p_device text, p_seq int, p_op text, p_discount int default 0,
                             p_method text default 'cash', p_total_override int default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'clientOperationId', p_op,
    'shopId', pg_temp.ctx(p_shop),
    'deviceId', pg_temp.ctx(p_device),
    'invoice', jsonb_build_object('fy', pg_temp.ctx('fy'), 'seq', p_seq),
    'occurredAt', now(),
    'origin', 'online',
    'source', 'keypad',
    'lines', jsonb_build_array(
      jsonb_build_object('kind', 'quick', 'label', 'Doodh', 'amountPaise', 5000),
      jsonb_build_object('kind', 'quick', 'amountPaise', 2500)),
    'billDiscountPaise', p_discount,
    'payments', jsonb_build_array(jsonb_build_object('method', p_method, 'amountPaise', coalesce(p_total_override, 7500 - p_discount))),
    'clientTotals', jsonb_build_object('subtotalPaise', 7500, 'discountPaise', p_discount, 'taxPaise', 0,
                                       'roundOffPaise', 0, 'totalPaise', 7500 - p_discount))
$$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users (id, phone, phone_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000e0a1', '919400000001', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e0b1', '919400000002', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e0c1', '919400000003', now(), 'authenticated', 'authenticated');
insert into ctx values ('fy', private.financial_year(now(), 'Asia/Kolkata'));

-- Shop A: owner A (device A), cashier C (device B). Shop B: owner B.
select pg_temp.login('00000000-0000-0000-0000-00000000e0a1');
insert into ctx select 'shopA', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-888888888881","name":"Bill Shop A","businessCategory":"kirana"}') ->> 'shopId';
insert into ctx select 'devA', public.register_device(pg_temp.ctx('shopA')::uuid, 'eeeeeeee-0000-4000-8000-000000000001', 'android') ->> 'deviceId';
insert into ctx select 'inv', public.invite_shop_member(pg_temp.ctx('shopA')::uuid, 'cashier', '+919400000003') ->> 'invitationId';
select pg_temp.login('00000000-0000-0000-0000-00000000e0c1');
select public.accept_shop_invitation(pg_temp.ctx('inv')::uuid);
insert into ctx select 'devC', public.register_device(pg_temp.ctx('shopA')::uuid, 'eeeeeeee-0000-4000-8000-000000000003', 'android') ->> 'deviceId';
select pg_temp.login('00000000-0000-0000-0000-00000000e0b1');
insert into ctx select 'shopB', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-888888888882","name":"Bill Shop B","businessCategory":"general"}') ->> 'shopId';
insert into ctx select 'devB', public.register_device(pg_temp.ctx('shopB')::uuid, 'eeeeeeee-0000-4000-8000-000000000002', 'android') ->> 'deviceId';

-- 1..6 create, replay, invoice sequence
select pg_temp.login('00000000-0000-0000-0000-00000000e0a1');
insert into ctx select 'sale1', public.create_sale(pg_temp.bill('shopA', 'devA', 1, '0190f0f0-0000-7000-8000-0000000e0001'))::text;
select is(pg_temp.ctx('sale1')::jsonb ->> 'invoiceNumber', 'DS/' || pg_temp.ctx('fy') || '/A-000001',
          'first quick bill gets the first invoice number of the device');
select is(public.create_sale(pg_temp.bill('shopA', 'devA', 1, '0190f0f0-0000-7000-8000-0000000e0001')) ->> 'saleId',
          pg_temp.ctx('sale1')::jsonb ->> 'saleId', 'a retried request (same operation id) returns the same sale');
select is((select count(*) from public.sales where shop_id = pg_temp.ctx('shopA')::uuid)::int, 1,
          'the retry did not create a second sale');
select throws_ok($$ select public.create_sale(pg_temp.bill('shopA', 'devA', 1, '0190f0f0-0000-7000-8000-0000000e0001', 0, 'upi')) $$,
                 'P0001', 'DS_IDEMPOTENCY_CONFLICT', 'the same operation id with a different bill is a conflict');
select throws_ok($$ select public.create_sale(pg_temp.bill('shopA', 'devA', 3, '0190f0f0-0000-7000-8000-0000000e0002')) $$,
                 'P0001', 'DS_INVOICE_SEQUENCE_CONFLICT', 'a gap in the invoice sequence is refused');
select throws_ok($$ select public.create_sale(pg_temp.bill('shopA', 'devA', 1, '0190f0f0-0000-7000-8000-0000000e0003')) $$,
                 'P0001', 'DS_INVOICE_SEQUENCE_CONFLICT', 'a used invoice number is refused for a new bill');

-- 7..9 next bill, UPI, items
insert into ctx select 'sale2', public.create_sale(pg_temp.bill('shopA', 'devA', 2, '0190f0f0-0000-7000-8000-0000000e0004', 0, 'upi'))::text;
select is(pg_temp.ctx('sale2')::jsonb ->> 'invoiceNumber', 'DS/' || pg_temp.ctx('fy') || '/A-000002', 'the next bill gets the next number');
select is((select confirmation from public.sale_payments where sale_id = (pg_temp.ctx('sale2')::jsonb ->> 'saleId')::uuid),
          'manual', 'UPI payments are recorded as confirmed by the shop');
select is((select string_agg(coalesce(label, '-') || ':' || net_paise, ',' order by line_no) from public.sale_items
            where sale_id = (pg_temp.ctx('sale2')::jsonb ->> 'saleId')::uuid), 'Doodh:5000,-:2500', 'lines are stored in order');

-- 10..15 validation
select throws_ok($$ select public.create_sale(jsonb_set(pg_temp.bill('shopA', 'devA', 3, '0190f0f0-0000-7000-8000-0000000e0005'),
                                                        '{clientTotals,totalPaise}', '7400')) $$,
                 'P0001', 'DS_TOTAL_MISMATCH', 'client totals must equal server totals');
select throws_ok($$ select public.create_sale(pg_temp.bill('shopA', 'devA', 3, '0190f0f0-0000-7000-8000-0000000e0006', 0, 'cash', 7000)) $$,
                 'P0001', 'DS_VALIDATION_FAILED', 'payments must add up to the total');
select throws_ok($$ select public.create_sale(pg_temp.bill('shopA', 'devA', 3, '0190f0f0-0000-7000-8000-0000000e0007', 0, 'card')) $$,
                 'P0001', 'DS_VALIDATION_FAILED', 'a payment method the shop has not enabled is refused');
select throws_ok($$ select public.create_sale(jsonb_set(jsonb_set(pg_temp.bill('shopA', 'devA', 3, '0190f0f0-0000-7000-8000-0000000e0008'),
                                                                  '{payments}', '[]'), '{udhaarPaise}', '7500')) $$,
                 'P0001', 'DS_CUSTOMER_REQUIRED', 'udhaar needs a customer');
select throws_ok($$ select public.create_sale(jsonb_set(pg_temp.bill('shopA', 'devA', 3, '0190f0f0-0000-7000-8000-0000000e0009'),
                                                        '{lines,0,kind}', '"product"')) $$,
                 'P0001', 'DS_VALIDATION_FAILED', 'product lines are not accepted before Phase 05');
select throws_ok($$ select public.create_sale(jsonb_set(pg_temp.bill('shopA', 'devA', 3, '0190f0f0-0000-7000-8000-0000000e000a'),
                                                        '{occurredAt}', '"2020-01-01T00:00:00Z"')) $$,
                 'P0001', 'DS_VALIDATION_FAILED', 'a bill time far in the past is refused online');

-- 16..18 discounts
select pg_temp.login('00000000-0000-0000-0000-00000000e0c1');
select throws_ok($$ select public.create_sale(pg_temp.bill('shopA', 'devC', 1, '0190f0f0-0000-7000-8000-0000000e000b', 500)) $$,
                 'P0001', 'DS_DISCOUNT_LIMIT_EXCEEDED', 'a cashier cannot give a discount above the shop limit (0 % by default)');
select pg_temp.login('00000000-0000-0000-0000-00000000e0a1');
insert into ctx select 'sale3', public.create_sale(pg_temp.bill('shopA', 'devA', 3, '0190f0f0-0000-7000-8000-0000000e000c', 500))::text;
select is(pg_temp.ctx('sale3')::jsonb -> 'totals' ->> 'totalPaise', '7000', 'the owner can give a discount');
reset role;
select ok(exists (select 1 from audit.events where action = 'sale.discount' and entity_id = pg_temp.ctx('sale3')::jsonb ->> 'saleId'),
          'discounts are audited');
select pg_temp.login('00000000-0000-0000-0000-00000000e0a1');

-- 19..21 devices and tenancy
select throws_ok($$ select public.create_sale(pg_temp.bill('shopA', 'devB', 4, '0190f0f0-0000-7000-8000-0000000e000d')) $$,
                 'P0001', 'DS_DEVICE_NOT_REGISTERED', 'a device of another shop cannot bill here');
select pg_temp.login('00000000-0000-0000-0000-00000000e0b1');
select throws_ok($$ select public.create_sale(pg_temp.bill('shopA', 'devB', 1, '0190f0f0-0000-7000-8000-0000000e000e')) $$,
                 'P0001', 'DS_NOT_A_MEMBER', 'a user of shop B cannot bill in shop A');
select is((select count(*) from public.sales where shop_id = pg_temp.ctx('shopA')::uuid)::int, 0,
          'shop B cannot read shop A sales');

-- 22..25 cashier visibility and receipts
select pg_temp.login('00000000-0000-0000-0000-00000000e0c1');
insert into ctx select 'saleC', public.create_sale(pg_temp.bill('shopA', 'devC', 1, '0190f0f0-0000-7000-8000-0000000e000f'))::text;
select is((select count(*) from public.sales where shop_id = pg_temp.ctx('shopA')::uuid)::int, 1,
          'a cashier sees only their own bills');
select throws_ok($$ select public.get_sale(pg_temp.ctx('shopA')::uuid, (pg_temp.ctx('sale1')::jsonb ->> 'saleId')::uuid) $$,
                 'P0001', 'DS_NOT_FOUND', 'a cashier cannot open the owner''s bill');
select pg_temp.login('00000000-0000-0000-0000-00000000e0a1');
select is((select count(*) from public.sales where shop_id = pg_temp.ctx('shopA')::uuid)::int, 4, 'the owner sees every bill');
select is((select jsonb_build_array(jsonb_array_length(s -> 'lines'), s -> 'payments' -> 0 ->> 'method', s -> 'shop' ->> 'name')
             from public.get_sale(pg_temp.ctx('shopA')::uuid, (pg_temp.ctx('sale2')::jsonb ->> 'saleId')::uuid) s),
          '[2, "upi", "Bill Shop A"]'::jsonb, 'get_sale returns lines, payments and the shop header for the receipt');

-- 26..28 settings, direct writes, revoked device
select public.update_shop_settings(pg_temp.ctx('shopA')::uuid, '{"cashierSeesAllSales":true}');
select pg_temp.login('00000000-0000-0000-0000-00000000e0c1');
select is((select count(*) from public.sales where shop_id = pg_temp.ctx('shopA')::uuid)::int, 4,
          'with cashierSeesAllSales a cashier sees every bill');
select throws_ok($$ insert into public.sales (shop_id, device_id, fy, seq, invoice_number, occurred_at, tax_mode, subtotal_paise,
                                              total_paise, paid_paise, client_operation_id, created_by)
                    values (pg_temp.ctx('shopA')::uuid, pg_temp.ctx('devC')::uuid, '2627', 99, 'X', now(), 'none', 1, 1, 1,
                            gen_random_uuid(), '00000000-0000-0000-0000-00000000e0c1') $$,
                 '42501', null, 'clients cannot insert sales directly');
select pg_temp.login('00000000-0000-0000-0000-00000000e0a1');
select public.revoke_device(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('devC')::uuid);
select pg_temp.login('00000000-0000-0000-0000-00000000e0c1');
select throws_ok($$ select public.create_sale(pg_temp.bill('shopA', 'devC', 2, '0190f0f0-0000-7000-8000-0000000e0010')) $$,
                 'P0001', 'DS_DEVICE_NOT_REGISTERED', 'a revoked device cannot bill');

select * from finish();
rollback;
