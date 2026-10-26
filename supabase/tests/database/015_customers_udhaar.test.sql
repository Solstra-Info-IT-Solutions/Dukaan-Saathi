-- Phase 08: customers, udhaar on bills, repayments, voids and returns of credit bills, owner adjustments, credit
-- limit policy, the ledger fixture (balance after every step = sum of entries), reports and day close.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;
create function pg_temp.ctx(p_k text) returns text language sql as $$ select v from ctx where k = p_k $$;

-- A one-line quick bill of p_total, paid p_paid in cash and the rest on udhaar for p_customer.
create function pg_temp.sale(p_seq int, p_op text, p_total bigint, p_paid bigint, p_customer text)
returns jsonb language sql as $$
  select public.create_sale(jsonb_build_object(
    'clientOperationId', p_op, 'shopId', pg_temp.ctx('shopA'), 'deviceId', pg_temp.ctx('devA'),
    'invoice', jsonb_build_object('fy', pg_temp.ctx('fy'), 'seq', p_seq), 'occurredAt', now(), 'origin', 'online',
    'lines', jsonb_build_array(jsonb_build_object('kind', 'quick', 'amountPaise', p_total)),
    'payments', case when p_paid > 0 then jsonb_build_array(jsonb_build_object('method', 'cash', 'amountPaise', p_paid))
                     else '[]'::jsonb end,
    'udhaarPaise', p_total - p_paid,
    'clientTotals', jsonb_build_object('subtotalPaise', p_total, 'discountPaise', 0, 'taxPaise', 0,
                                       'roundOffPaise', 0, 'totalPaise', p_total))
    || case when p_customer is null then '{}'::jsonb else jsonb_build_object('customerId', pg_temp.ctx(p_customer)) end)
$$;
create function pg_temp.repay(p_op text, p_amount bigint, p_method text default 'cash', p_device text default 'devA')
returns jsonb language sql as $$
  select public.record_customer_repayment(jsonb_build_object('clientOperationId', p_op, 'shopId', pg_temp.ctx('shopA'),
    'deviceId', pg_temp.ctx(p_device), 'customerId', pg_temp.ctx('ramesh'), 'amountPaise', p_amount, 'method', p_method))
$$;
create function pg_temp.adjust(p_op text, p_amount bigint, p_reason text)
returns jsonb language sql as $$
  select public.adjust_customer_balance(jsonb_build_object('clientOperationId', p_op, 'shopId', pg_temp.ctx('shopA'),
    'customerId', pg_temp.ctx('ramesh'), 'amountPaise', p_amount, 'reason', p_reason))
$$;
create function pg_temp.balance() returns bigint language sql as $$
  select balance_paise from public.customers where id = pg_temp.ctx('ramesh')::uuid
$$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users (id, phone, phone_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000009a1', '919400000091', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000009b1', '919400000092', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000009c1', '919400000093', now(), 'authenticated', 'authenticated');
insert into ctx values ('fy', private.financial_year(now(), 'Asia/Kolkata')),
                       ('ramesh', '0190f0f0-0000-7000-8000-0000000009e1'), ('sita', '0190f0f0-0000-7000-8000-0000000009e2'),
                       ('mohan', '0190f0f0-0000-7000-8000-0000000009e3');

select pg_temp.login('00000000-0000-0000-0000-0000000009a1');
insert into ctx select 'shopA', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-8888888889a1","name":"Udhaar Shop A","businessCategory":"kirana"}') ->> 'shopId';
insert into ctx select 'devA', public.register_device(pg_temp.ctx('shopA')::uuid, 'eeeeeeee-0000-4000-8000-0000000009a1', 'android') ->> 'deviceId';
insert into ctx select 'invC', public.invite_shop_member(pg_temp.ctx('shopA')::uuid, 'cashier', '+919400000093') ->> 'invitationId';
select pg_temp.login('00000000-0000-0000-0000-0000000009c1');
select public.accept_shop_invitation(pg_temp.ctx('invC')::uuid);
select pg_temp.login('00000000-0000-0000-0000-0000000009b1');
insert into ctx select 'shopB', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-8888888889b1","name":"Udhaar Shop B","businessCategory":"general"}') ->> 'shopId';

-- 1..6 customers
select pg_temp.login('00000000-0000-0000-0000-0000000009a1');
select is(public.save_customer(jsonb_build_object('id', pg_temp.ctx('ramesh'), 'shopId', pg_temp.ctx('shopA'),
  'name', 'Ramesh', 'phone', '+919822222222', 'creditLimitPaise', 100000, 'openingBalancePaise', 50000)) ->> 'balancePaise',
  '50000', 'a customer starts with the udhaar already owed (₹500)');
select is(public.save_customer(jsonb_build_object('id', pg_temp.ctx('ramesh'), 'shopId', pg_temp.ctx('shopA'),
  'name', 'Ramesh Kumar', 'phone', '+919822222222', 'creditLimitPaise', 100000, 'openingBalancePaise', 99999)) ->> 'balancePaise',
  '50000', 'editing a customer never changes the balance');
select throws_ok($$ select public.save_customer(jsonb_build_object('id', pg_temp.ctx('mohan'), 'shopId', pg_temp.ctx('shopA'),
  'name', 'Someone else', 'phone', '+919822222222')) $$, 'P0001', 'DS_CONFLICT', 'phone numbers are unique per shop');
select pg_temp.login('00000000-0000-0000-0000-0000000009c1');
select is(public.save_customer(jsonb_build_object('id', pg_temp.ctx('sita'), 'shopId', pg_temp.ctx('shopA'),
  'name', 'Sita', 'phone', '+919833333333')) ->> 'name', 'Sita', 'a cashier can quick-add a customer from billing');
select throws_ok($$ select public.save_customer(jsonb_build_object('id', pg_temp.ctx('mohan'), 'shopId', pg_temp.ctx('shopA'),
  'name', 'Mohan', 'openingBalancePaise', 1000)) $$, 'P0001', 'DS_PERMISSION_DENIED',
  'a cashier cannot set an opening balance');
select throws_ok($$ select public.save_customer(jsonb_build_object('id', pg_temp.ctx('sita'), 'shopId', pg_temp.ctx('shopA'),
  'name', 'Sita Devi')) $$, 'P0001', 'DS_PERMISSION_DENIED', 'a cashier cannot edit customers');

-- 7..12 credit bills and the credit limit (₹1,000; shop policy "warn" by default)
select pg_temp.login('00000000-0000-0000-0000-0000000009a1');
insert into ctx select 's1', pg_temp.sale(1, '0190f0f0-0000-7000-8000-000000090001', 30000, 0, 'ramesh')::text;
select is(pg_temp.ctx('s1')::jsonb ->> 'customerBalancePaise', '80000', 'a ₹300 credit bill raises the balance to ₹800');
select is((select kind || ':' || amount_paise from public.customer_ledger_entries
            where sale_id = (pg_temp.ctx('s1')::jsonb ->> 'saleId')::uuid), 'sale:30000', 'the bill is a "sale" entry');
select throws_ok($$ select pg_temp.sale(2, '0190f0f0-0000-7000-8000-000000090002', 1000, 0, null) $$,
  'P0001', 'DS_CUSTOMER_REQUIRED', 'udhaar needs a customer');
insert into ctx select 's2', pg_temp.sale(2, '0190f0f0-0000-7000-8000-000000090003', 40000, 10000, 'ramesh')::text;
select is(pg_temp.ctx('s2')::jsonb -> 'warnings' -> 0 ->> 'code', 'CREDIT_LIMIT',
          'going over the limit with policy "warn" saves the bill and warns');
select is(pg_temp.balance(), 110000::bigint, '₹100 paid, ₹300 on udhaar: balance ₹1,100');
select public.update_shop_settings(pg_temp.ctx('shopA')::uuid, '{"creditLimitPolicy":"block"}');
select throws_ok($$ select pg_temp.sale(3, '0190f0f0-0000-7000-8000-000000090004', 1000, 0, 'ramesh') $$,
  'P0001', 'DS_CREDIT_LIMIT_EXCEEDED', 'policy "block" refuses udhaar over the limit');

-- 13..14 udhaar method switched off
select public.update_shop_settings(pg_temp.ctx('shopA')::uuid, '{"creditLimitPolicy":"none","enabledPaymentMethods":["cash","upi"]}');
select throws_ok($$ select pg_temp.sale(3, '0190f0f0-0000-7000-8000-000000090005', 1000, 0, 'sita') $$,
  'P0001', 'DS_VALIDATION_FAILED', 'udhaar is refused when the shop has switched it off');
select public.update_shop_settings(pg_temp.ctx('shopA')::uuid, '{"enabledPaymentMethods":["cash","upi","udhaar"]}');
select is(pg_temp.sale(3, '0190f0f0-0000-7000-8000-000000090006', 1000, 0, 'sita') ->> 'customerBalancePaise', '1000',
          'with policy "none" there is no limit check');

-- 15..17 repayments
select is(pg_temp.repay('0190f0f0-0000-7000-8000-000000090101', 20000) ->> 'balancePaise', '90000',
          'a ₹200 repayment lowers the balance to ₹900');
select is(pg_temp.repay('0190f0f0-0000-7000-8000-000000090101', 20000) ->> 'replayed', 'true',
          'repeating a repayment replays it');
select is(pg_temp.balance(), 90000::bigint, 'the replay did not count twice');

-- 18..19 void of a credit bill reverses its udhaar
select public.void_sale(jsonb_build_object('clientOperationId', '0190f0f0-0000-7000-8000-000000090201',
  'shopId', pg_temp.ctx('shopA'), 'saleId', pg_temp.ctx('s2')::jsonb ->> 'saleId', 'reason', 'Wrong customer'));
select is(pg_temp.balance(), 60000::bigint, 'voiding the ₹300-udhaar bill brings the balance back to ₹600');
select is((select kind || ':' || amount_paise from public.customer_ledger_entries
            where sale_id = (pg_temp.ctx('s2')::jsonb ->> 'saleId')::uuid and kind = 'sale_void'), 'sale_void:-30000',
          'the void is its own entry');

-- 20..23 owner adjustment
select pg_temp.login('00000000-0000-0000-0000-0000000009c1');
select throws_ok($$ select pg_temp.adjust('0190f0f0-0000-7000-8000-000000090301', -10000, 'Discount for old customer') $$,
  'P0001', 'DS_PERMISSION_DENIED', 'a cashier cannot adjust a balance');
select pg_temp.login('00000000-0000-0000-0000-0000000009a1');
select throws_ok($$ select pg_temp.adjust('0190f0f0-0000-7000-8000-000000090302', -10000, ' ') $$,
  'P0001', 'DS_VALIDATION_FAILED', 'an adjustment needs a reason');
select is(pg_temp.adjust('0190f0f0-0000-7000-8000-000000090303', -10000, 'Discount for old customer') ->> 'balancePaise',
          '50000', 'the owner adjusts −₹100: balance ₹500');
reset role; -- the audit trail is not readable by clients
select ok(exists (select 1 from audit.events where action = 'udhaar.adjusted' and reason = 'Discount for old customer'),
          'the adjustment is audited with its reason');
select pg_temp.login('00000000-0000-0000-0000-0000000009a1');

-- 24..26 returns of a credit bill can go to the account
select is(public.create_sale_return(jsonb_build_object('clientOperationId', '0190f0f0-0000-7000-8000-000000090401',
  'shopId', pg_temp.ctx('shopA'), 'deviceId', pg_temp.ctx('devA'), 'saleId', pg_temp.ctx('s1')::jsonb ->> 'saleId',
  'lines', '[{"lineNo":1,"quantityMilli":1000}]'::jsonb, 'refundMethod', 'udhaar', 'reason', 'Returned goods'))
  ->> 'refundPaise', '30000', 'returning the ₹300 credit bill to the account');
select is(pg_temp.balance(), 20000::bigint, 'the return lowers the balance to ₹200');
insert into ctx select 's4', pg_temp.sale(4, '0190f0f0-0000-7000-8000-000000090007', 500, 500, null)::text;
select throws_ok($$ select public.create_sale_return(jsonb_build_object('clientOperationId', '0190f0f0-0000-7000-8000-000000090402',
  'shopId', pg_temp.ctx('shopA'), 'deviceId', pg_temp.ctx('devA'), 'saleId', pg_temp.ctx('s4')::jsonb ->> 'saleId',
  'lines', '[{"lineNo":1,"quantityMilli":1000}]'::jsonb, 'refundMethod', 'udhaar', 'reason', 'Returned goods')) $$,
  'P0001', 'DS_VALIDATION_FAILED', 'a bill without a customer cannot be refunded to udhaar');

-- 27 a bill with returns cannot be voided (stock and money already went back)
select throws_ok($$ select public.void_sale(jsonb_build_object('clientOperationId', '0190f0f0-0000-7000-8000-000000090202',
  'shopId', pg_temp.ctx('shopA'), 'saleId', pg_temp.ctx('s1')::jsonb ->> 'saleId', 'reason', 'Try again')) $$,
  'P0001', 'DS_CONFLICT', 'a bill with returns cannot be voided');

-- 28..30 the ledger fixture
select pg_temp.login('00000000-0000-0000-0000-0000000009c1');
select is(pg_temp.repay('0190f0f0-0000-7000-8000-000000090102', 5000, 'upi', null) ->> 'balancePaise', '15000',
          'a cashier can collect udhaar (₹50 by UPI)');
select pg_temp.login('00000000-0000-0000-0000-0000000009a1');
select is((select jsonb_agg(e ->> 'kind' || ' ' || (e ->> 'amountPaise') || ' → ' || (e ->> 'balanceAfterPaise'))
             from jsonb_array_elements(public.get_customer_ledger(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('ramesh')::uuid) -> 'entries') e),
          '["repayment -5000 → 15000", "sale_return -30000 → 20000", "adjustment -10000 → 50000", "sale_void -30000 → 60000",
            "repayment -20000 → 90000", "sale 30000 → 110000", "sale 30000 → 80000", "opening 50000 → 50000"]'::jsonb,
          'every step is its own entry with the balance after it (newest first)');
select is(public.check_customer_drift(pg_temp.ctx('shopA')::uuid), '[]'::jsonb, 'cached balances equal the sum of entries');

-- 31..33 udhaar list, reports, day close
select is((select jsonb_build_object('names', jsonb_agg(r ->> 'name'), 'total', l -> 'totalOutstandingPaise')
             from (select public.list_customers(pg_temp.ctx('shopA')::uuid, null, 'highest', true) as l) x,
                  jsonb_array_elements(x.l -> 'rows') r group by l),
          '{"names": ["Ramesh Kumar", "Sita"], "total": 16000}'::jsonb, 'udhaar list, highest first, with the total outstanding');
select is(public.get_dashboard_snapshot(pg_temp.ctx('shopA')::uuid) ->> 'udhaarCollectedPaise', '25000',
          'the dashboard shows udhaar collected today');
select is(public.get_day_close(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('devA')::uuid) -> 'breakdown' ->> 'cashRepaymentsPaise',
          '20000', 'cash repayments on this phone count towards expected cash (the UPI one does not)');

-- 34 receipt shows the customer
select is(public.get_sale(pg_temp.ctx('shopA')::uuid, (pg_temp.ctx('s1')::jsonb ->> 'saleId')::uuid) -> 'customer' ->> 'name',
          'Ramesh Kumar', 'the bill carries the customer');

-- 35 archive needs a zero balance
select throws_ok($$ select public.archive_customer(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('ramesh')::uuid) $$,
  'P0001', 'DS_CONFLICT', 'a customer who owes money cannot be archived');

-- 36 tenancy: shop B sees nothing of shop A
select pg_temp.login('00000000-0000-0000-0000-0000000009b1');
select is((select count(*) from public.customers where shop_id = pg_temp.ctx('shopA')::uuid)
          + (select count(*) from public.customer_ledger_entries where shop_id = pg_temp.ctx('shopA')::uuid), 0::bigint,
          'shop B cannot read shop A customers or their ledger');

select * from finish();
rollback;
