-- Phase 06: a seeded business day (sales, a void, a return, expenses) and the exact numbers the dashboard, the
-- sales report and day close must show; returns; expenses; entitlement gating; export quota.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;
create function pg_temp.ctx(p_k text) returns text language sql as $$ select v from ctx where k = p_k $$;

-- A cash/UPI bill with given lines; totals are passed by the caller (no tax, no discount).
create function pg_temp.sale(p_device text, p_seq int, p_op text, p_lines jsonb, p_total bigint, p_method text default 'cash')
returns jsonb language sql as $$
  select public.create_sale(jsonb_build_object(
    'clientOperationId', p_op, 'shopId', pg_temp.ctx('shopA'), 'deviceId', pg_temp.ctx(p_device),
    'invoice', jsonb_build_object('fy', pg_temp.ctx('fy'), 'seq', p_seq), 'occurredAt', now(), 'origin', 'online',
    'lines', p_lines, 'payments', jsonb_build_array(jsonb_build_object('method', p_method, 'amountPaise', p_total)),
    'clientTotals', jsonb_build_object('subtotalPaise', p_total, 'discountPaise', 0, 'taxPaise', 0,
                                       'roundOffPaise', 0, 'totalPaise', p_total)))
$$;
create function pg_temp.ret(p_sale text, p_op text, p_lines jsonb, p_method text default 'cash')
returns jsonb language sql as $$
  select public.create_sale_return(jsonb_build_object(
    'clientOperationId', p_op, 'shopId', pg_temp.ctx('shopA'), 'deviceId', pg_temp.ctx('devA'),
    'saleId', pg_temp.ctx(p_sale)::jsonb ->> 'saleId', 'lines', p_lines, 'refundMethod', p_method,
    'reason', 'Customer returned'))
$$;
create function pg_temp.expense(p_id text, p_category text, p_amount bigint, p_method text, p_device text default 'devA')
returns jsonb language sql as $$
  select public.record_expense(jsonb_build_object('id', p_id, 'shopId', pg_temp.ctx('shopA'),
    'deviceId', pg_temp.ctx(p_device), 'category', p_category, 'amountPaise', p_amount, 'method', p_method))
$$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users (id, phone, phone_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000006a1', '919400000061', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000006b1', '919400000062', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000006c1', '919400000063', now(), 'authenticated', 'authenticated');
insert into ctx values ('fy', private.financial_year(now(), 'Asia/Kolkata')),
                       ('today', private.financial_year(now(), 'Asia/Kolkata')), -- replaced below
                       ('sugar', '0190f0f0-0000-7000-8000-0000000006e1');
update ctx set v = ((now() at time zone 'Asia/Kolkata')::date)::text where k = 'today';

-- Shop A: owner (device A) + cashier C (device C). Shop B: owner B.
select pg_temp.login('00000000-0000-0000-0000-0000000006a1');
insert into ctx select 'shopA', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-8888888886a1","name":"Report Shop A","businessCategory":"kirana"}') ->> 'shopId';
insert into ctx select 'devA', public.register_device(pg_temp.ctx('shopA')::uuid, 'eeeeeeee-0000-4000-8000-0000000006a1', 'android') ->> 'deviceId';
insert into ctx select 'invC', public.invite_shop_member(pg_temp.ctx('shopA')::uuid, 'cashier', '+919400000063') ->> 'invitationId';
select public.save_product(pg_temp.ctx('shopA')::uuid, jsonb_build_object('id', pg_temp.ctx('sugar'),
  'name', 'Sugar 1kg', 'unitCode', 'pc', 'pricePaise', 4500, 'trackStock', true, 'barcodes', '[]'::jsonb, 'aliases', '[]'::jsonb));
select pg_temp.login('00000000-0000-0000-0000-0000000006c1');
select public.accept_shop_invitation(pg_temp.ctx('invC')::uuid);
insert into ctx select 'devC', public.register_device(pg_temp.ctx('shopA')::uuid, 'eeeeeeee-0000-4000-8000-0000000006c1', 'android') ->> 'deviceId';
select pg_temp.login('00000000-0000-0000-0000-0000000006b1');
insert into ctx select 'shopB', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-8888888886b1","name":"Report Shop B","businessCategory":"general"}') ->> 'shopId';
reset role;
update public.products set stock_on_hand_milli = 10000, last_cost_paise = 4000 where id = '0190f0f0-0000-7000-8000-0000000006e1';

-- The day: s1 2 × sugar ₹90 cash, s2 ₹50 UPI, s3 ₹20 cash (voided), s4 ₹10 cash by the cashier;
-- return 1 sugar from s1 (₹45 cash); expenses ₹3 tea (cash, device A), ₹100 rent (UPI), ₹5 voided.
select pg_temp.login('00000000-0000-0000-0000-0000000006a1');
insert into ctx select 's1', pg_temp.sale('devA', 1, '0190f0f0-0000-7000-8000-000000060001',
  jsonb_build_array(jsonb_build_object('kind', 'product', 'productId', pg_temp.ctx('sugar'), 'quantityMilli', 2000, 'unitPricePaise', 4500)), 9000)::text;
insert into ctx select 's2', pg_temp.sale('devA', 2, '0190f0f0-0000-7000-8000-000000060002',
  '[{"kind":"quick","amountPaise":5000}]', 5000, 'upi')::text;
insert into ctx select 's3', pg_temp.sale('devA', 3, '0190f0f0-0000-7000-8000-000000060003',
  '[{"kind":"quick","amountPaise":2000}]', 2000)::text;
select public.void_sale(jsonb_build_object('clientOperationId', '0190f0f0-0000-7000-8000-000000060004',
  'shopId', pg_temp.ctx('shopA'), 'saleId', pg_temp.ctx('s3')::jsonb ->> 'saleId', 'reason', 'Wrong bill'));
select pg_temp.login('00000000-0000-0000-0000-0000000006c1');
insert into ctx select 's4', pg_temp.sale('devC', 1, '0190f0f0-0000-7000-8000-000000060005',
  '[{"kind":"quick","amountPaise":1000}]', 1000)::text;
select pg_temp.login('00000000-0000-0000-0000-0000000006a1');
insert into ctx select 'r1', pg_temp.ret('s1', '0190f0f0-0000-7000-8000-000000060006', '[{"lineNo":1,"quantityMilli":1000}]')::text;
select pg_temp.expense('0190f0f0-0000-7000-8000-000000060101', 'tea_snacks', 300, 'cash');
select pg_temp.expense('0190f0f0-0000-7000-8000-000000060102', 'rent', 10000, 'upi');
select pg_temp.expense('0190f0f0-0000-7000-8000-000000060103', 'other', 500, 'cash');
select public.void_expense(pg_temp.ctx('shopA')::uuid, '0190f0f0-0000-7000-8000-000000060103', 'Entered twice');

-- 1..5 returns
select is(pg_temp.ctx('r1')::jsonb ->> 'refundPaise', '4500', 'returning 1 of 2 sugar refunds half the line');
select is((select stock_on_hand_milli from public.products where id = pg_temp.ctx('sugar')::uuid), 9000::bigint,
          'returned stock comes back (10 − 2 + 1)');
select is((select l ->> 'returnedQuantityMilli' from jsonb_array_elements(
             public.get_sale(pg_temp.ctx('shopA')::uuid, (pg_temp.ctx('s1')::jsonb ->> 'saleId')::uuid) -> 'lines') l), '1000',
          'the receipt shows how much of the line was returned');
select throws_ok($$ select pg_temp.ret('s1', '0190f0f0-0000-7000-8000-000000060007', '[{"lineNo":1,"quantityMilli":2000}]') $$,
  'P0001', 'DS_VALIDATION_FAILED', 'cannot return more than is left on the line');
select throws_ok($$ select pg_temp.ret('s3', '0190f0f0-0000-7000-8000-000000060008', '[{"lineNo":1,"quantityMilli":1000}]') $$,
  'P0001', 'DS_SALE_ALREADY_VOIDED', 'a voided bill cannot be returned');

-- 6..7 return permissions and quick lines
select throws_ok($$ select pg_temp.ret('s2', '0190f0f0-0000-7000-8000-000000060009', '[{"lineNo":1,"quantityMilli":500}]') $$,
  'P0001', 'DS_VALIDATION_FAILED', 'a quick amount is returned whole or not at all');
select pg_temp.login('00000000-0000-0000-0000-0000000006c1');
select throws_ok($$ select pg_temp.ret('s4', '0190f0f0-0000-7000-8000-00000006000a', '[{"lineNo":1,"quantityMilli":1000}]') $$,
  'P0001', 'DS_PERMISSION_DENIED', 'a cashier cannot take returns');

-- 8..15 dashboard: exact numbers of the seeded day
select pg_temp.login('00000000-0000-0000-0000-0000000006a1');
insert into ctx select 'dash', public.get_dashboard_snapshot(pg_temp.ctx('shopA')::uuid)::text;
select is(pg_temp.ctx('dash')::jsonb ->> 'salesPaise', '15000', 'sales = 90 + 50 + 10 (voided ₹20 excluded)');
select is(pg_temp.ctx('dash')::jsonb ->> 'bills', '3', 'bills exclude the voided one');
select is(pg_temp.ctx('dash')::jsonb ->> 'voidedBills', '1', 'voided bills are counted separately');
select is(pg_temp.ctx('dash')::jsonb ->> 'returnsPaise', '4500', 'returns of the day');
select is(pg_temp.ctx('dash')::jsonb ->> 'netSalesPaise', '10500', 'net sales = sales − returns');
select is(pg_temp.ctx('dash')::jsonb -> 'payments', '{"cash": 10000, "upi": 5000}'::jsonb, 'payments by method');
select is(pg_temp.ctx('dash')::jsonb ->> 'expensesPaise', '10300', 'expenses exclude the voided one');
select is(pg_temp.ctx('dash')::jsonb -> 'profit', '{"profitPaise": 1000, "linesWithCost": 1, "lines": 3}'::jsonb,
          'profit estimate: sugar 9000 − cost 2 × 4000; coverage 1 of 3 lines');

-- 16..17 cashier dashboard
select pg_temp.login('00000000-0000-0000-0000-0000000006c1');
select is(public.get_dashboard_snapshot(pg_temp.ctx('shopA')::uuid) - 'businessDate',
          '{"scope": "own", "salesPaise": 1000, "bills": 1}'::jsonb, 'a cashier sees only their own sales of the day');
select throws_ok($$ select public.get_sales_report(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('today')::date, pg_temp.ctx('today')::date) $$,
  'P0001', 'DS_PERMISSION_DENIED', 'a cashier cannot open reports');

-- 18..22 day close (device A): expected = 10 opening + 90 cash sales − 45 cash refund − 3 cash expense = ₹52
select pg_temp.login('00000000-0000-0000-0000-0000000006a1');
select is(public.get_day_close(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('devA')::uuid) -> 'breakdown' ->> 'expectedCashPaise',
          '4200', 'before closing, the expected cash of device A without opening cash is ₹42');
insert into ctx select 'close', public.close_day(jsonb_build_object('clientOperationId', '0190f0f0-0000-7000-8000-000000060201',
  'shopId', pg_temp.ctx('shopA'), 'deviceId', pg_temp.ctx('devA'), 'openingCashPaise', 1000, 'countedCashPaise', 5000))::text;
select is(pg_temp.ctx('close')::jsonb -> 'breakdown',
          '{"openingCashPaise": 1000, "cashSalesPaise": 9000, "cashRefundsPaise": 4500, "cashExpensesPaise": 300, "cashSupplierPaymentsPaise": 0, "cashRepaymentsPaise": 0, "expectedCashPaise": 5200}'::jsonb,
          'day close stores the expected cash breakdown');
select is(pg_temp.ctx('close')::jsonb ->> 'differencePaise', '-200', 'counted ₹50 against expected ₹52 is ₹2 short');
select is(public.close_day(jsonb_build_object('clientOperationId', '0190f0f0-0000-7000-8000-000000060201',
  'shopId', pg_temp.ctx('shopA'), 'deviceId', pg_temp.ctx('devA'), 'openingCashPaise', 1000, 'countedCashPaise', 5000)) ->> 'replayed',
  'true', 'repeating the same close request replays it');
select throws_ok($$ select public.close_day(jsonb_build_object('clientOperationId', '0190f0f0-0000-7000-8000-000000060202',
  'shopId', pg_temp.ctx('shopA'), 'deviceId', pg_temp.ctx('devA'), 'countedCashPaise', 5000)) $$,
  'P0001', 'DS_CONFLICT', 'a device closes a day once');

-- 23..27 sales report and entitlements
select is((select (r -> 'rows' -> 0) - 'key' - 'label' from public.get_sales_report(pg_temp.ctx('shopA')::uuid,
             pg_temp.ctx('today')::date, pg_temp.ctx('today')::date) r),
          '{"salesPaise": 15000, "bills": 3, "returnsPaise": 4500, "netPaise": 10500, "profitPaise": 1000}'::jsonb,
          'the daily report row equals the dashboard');
select is((select jsonb_agg(x - 'key' order by (x ->> 'salesPaise')::bigint desc)
             from jsonb_array_elements(public.get_sales_report(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('today')::date,
                                                               pg_temp.ctx('today')::date, 'product') -> 'rows') x),
          '[{"label": "Sugar 1kg", "salesPaise": 9000, "quantityMilli": 2000, "bills": 1, "profitPaise": 1000},
            {"label": "quick", "salesPaise": 6000, "quantityMilli": null, "bills": 2, "profitPaise": 0}]'::jsonb,
          'report by product (trial plan includes advanced reports)');
reset role;
insert into public.shop_entitlement_overrides (shop_id, entitlement_key, value, reason)
values (pg_temp.ctx('shopA')::uuid, 'reports.advanced', 'false', 'test: basic plan'),
       (pg_temp.ctx('shopA')::uuid, 'exports.monthly', '1', 'test: one export');
select pg_temp.login('00000000-0000-0000-0000-0000000006a1');
select throws_ok($$ select public.get_sales_report(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('today')::date, pg_temp.ctx('today')::date, 'product') $$,
  'P0001', 'DS_ENTITLEMENT_REQUIRED', 'breakdowns need reports.advanced');
select throws_ok($$ select public.get_sales_report(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('today')::date - 7, pg_temp.ctx('today')::date) $$,
  'P0001', 'DS_ENTITLEMENT_REQUIRED', 'more than 7 days needs reports.advanced');
select is(jsonb_array_length(public.get_sales_report(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('today')::date - 6,
            pg_temp.ctx('today')::date) -> 'rows'), 7, '7 days are allowed on every plan, one row per day');

-- 28..29 export quota
select is(public.begin_report_export(pg_temp.ctx('shopA')::uuid), '{"used": 1, "limit": 1}'::jsonb, 'the first export of the month is counted');
select throws_ok($$ select public.begin_report_export(pg_temp.ctx('shopA')::uuid) $$,
  'P0001', 'DS_QUOTA_EXCEEDED', 'exports stop at the monthly limit');

-- 30..34 expenses
select is(pg_temp.expense('0190f0f0-0000-7000-8000-000000060101', 'tea_snacks', 300, 'cash') ->> 'replayed', 'true',
          'saving the same expense id again returns it instead of a duplicate');
select throws_ok($$ select public.record_expense(jsonb_build_object('id', '0190f0f0-0000-7000-8000-000000060104',
  'shopId', pg_temp.ctx('shopA'), 'category', 'rent', 'amountPaise', 100, 'method', 'cash',
  'attachmentPath', pg_temp.ctx('shopB') || '/x/receipt.jpg')) $$,
  'P0001', 'DS_VALIDATION_FAILED', 'an attachment must live under this shop and expense');
select throws_ok($$ select public.record_expense(jsonb_build_object('id', '0190f0f0-0000-7000-8000-000000060105',
  'shopId', pg_temp.ctx('shopA'), 'category', 'rent', 'amountPaise', 100, 'method', 'cash',
  'businessDate', (pg_temp.ctx('today')::date + 1)::text)) $$,
  'P0001', 'DS_VALIDATION_FAILED', 'an expense cannot be dated in the future');
select pg_temp.login('00000000-0000-0000-0000-0000000006c1');
select throws_ok($$ select pg_temp.expense('0190f0f0-0000-7000-8000-000000060106', 'rent', 100, 'cash', 'devC') $$,
  'P0001', 'DS_PERMISSION_DENIED', 'a cashier cannot record expenses');
select pg_temp.login('00000000-0000-0000-0000-0000000006b1');
select is((select count(*) from public.expenses where shop_id = pg_temp.ctx('shopA')::uuid)::int, 0,
          'shop B cannot read shop A expenses');

select * from finish();
rollback;
