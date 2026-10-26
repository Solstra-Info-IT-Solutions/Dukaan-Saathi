-- Phase 09: sync_push (per-operation results, savepoints, replays, needs_review rules for offline bills,
-- quarantine, customer merge by phone with aliases) and sync_pull (keyset cursors, archived rows, permissions).
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;
create function pg_temp.ctx(p_k text) returns text language sql as $$ select v from ctx where k = p_k $$;

-- An offline bill as the phone queues it: one line, paid in cash unless p_udhaar_for is given.
create function pg_temp.bill(p_device text, p_seq int, p_op text, p_line jsonb, p_total bigint,
                             p_occurred timestamptz default now(), p_udhaar_for text default null,
                             p_client_total bigint default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'clientOperationId', p_op, 'saleId', gen_random_uuid(), 'shopId', pg_temp.ctx('shopA'),
    'deviceId', pg_temp.ctx(p_device),
    'invoice', jsonb_build_object('fy', pg_temp.ctx('fy'), 'seq', p_seq),
    'occurredAt', p_occurred, 'lines', jsonb_build_array(p_line),
    'payments', case when p_udhaar_for is null then jsonb_build_array(jsonb_build_object('method', 'cash', 'amountPaise', p_total))
                     else '[]'::jsonb end,
    'clientTotals', jsonb_build_object('subtotalPaise', coalesce(p_client_total, p_total), 'discountPaise', 0, 'taxPaise', 0,
                                       'roundOffPaise', 0, 'totalPaise', coalesce(p_client_total, p_total)))
    || case when p_udhaar_for is null then '{}'::jsonb
            else jsonb_build_object('udhaarPaise', p_total, 'customerId', pg_temp.ctx(p_udhaar_for)) end
$$;
create function pg_temp.quick(p_amount bigint) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'quick', 'amountPaise', p_amount)
$$;
create function pg_temp.item(p_product text, p_price bigint) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'product', 'productId', pg_temp.ctx(p_product), 'quantityMilli', 1000,
                            'unitPricePaise', p_price)
$$;
create function pg_temp.op(p_kind text, p_payload jsonb) returns jsonb language sql as $$
  select jsonb_build_object('clientOperationId', coalesce(p_payload ->> 'clientOperationId', p_payload ->> 'id'),
                            'operation', p_kind, 'payload', p_payload)
$$;
create function pg_temp.push(p_device text, variadic p_ops jsonb[]) returns jsonb language sql as $$
  select public.sync_push(jsonb_build_object('shopId', pg_temp.ctx('shopA'), 'deviceId', pg_temp.ctx(p_device),
                                             'operations', to_jsonb(p_ops)))
$$;
-- Status (and review reasons / quarantine code) of each result, for compact assertions.
create function pg_temp.statuses(p_result jsonb) returns jsonb language sql as $$
  select jsonb_agg(r ->> 'status' || coalesce(':' || (r -> 'result' ->> 'reviewReasons'), '')
                   || coalesce(':' || (r ->> 'code'), '') order by n)
    from jsonb_array_elements(p_result -> 'results') with ordinality t(r, n)
$$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users (id, phone, phone_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000a9a1', '919400000191', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a9b1', '919400000192', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a9c1', '919400000193', now(), 'authenticated', 'authenticated');
insert into ctx values ('fy', private.financial_year(now(), 'Asia/Kolkata')),
                       ('today', ((now() at time zone 'Asia/Kolkata')::date)::text),
                       ('sugar', '0190f0f0-0000-7000-8000-00000000a9e1'), ('salt', '0190f0f0-0000-7000-8000-00000000a9e2'),
                       ('old', '0190f0f0-0000-7000-8000-00000000a9e3'),
                       ('raju', '0190f0f0-0000-7000-8000-00000000a9f1'), ('raju2', '0190f0f0-0000-7000-8000-00000000a9f2');

select pg_temp.login('00000000-0000-0000-0000-00000000a9a1');
insert into ctx select 'shopA', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-88888888a9a1","name":"Sync Shop A","businessCategory":"kirana"}') ->> 'shopId';
insert into ctx select 'devA', public.register_device(pg_temp.ctx('shopA')::uuid, 'eeeeeeee-0000-4000-8000-00000000a9a1', 'android') ->> 'deviceId';
insert into ctx select 'invC', public.invite_shop_member(pg_temp.ctx('shopA')::uuid, 'cashier', '+919400000193') ->> 'invitationId';
select public.save_product(pg_temp.ctx('shopA')::uuid, jsonb_build_object('id', pg_temp.ctx('sugar'), 'name', 'Sugar',
  'unitCode', 'pc', 'pricePaise', 4500, 'trackStock', true, 'barcodes', '[]'::jsonb, 'aliases', '[]'::jsonb));
select public.save_product(pg_temp.ctx('shopA')::uuid, jsonb_build_object('id', pg_temp.ctx('salt'), 'name', 'Salt',
  'unitCode', 'pc', 'pricePaise', 2000, 'barcodes', '[]'::jsonb, 'aliases', '[]'::jsonb));
select public.save_product(pg_temp.ctx('shopA')::uuid, jsonb_build_object('id', pg_temp.ctx('old'), 'name', 'Old item',
  'unitCode', 'pc', 'pricePaise', 1000, 'barcodes', '[]'::jsonb, 'aliases', '[]'::jsonb));
select public.update_shop_settings(pg_temp.ctx('shopA')::uuid, '{"negativeStockPolicy":"block","creditLimitPolicy":"block"}');
select pg_temp.login('00000000-0000-0000-0000-00000000a9c1');
select public.accept_shop_invitation(pg_temp.ctx('invC')::uuid);
insert into ctx select 'devC', public.register_device(pg_temp.ctx('shopA')::uuid, 'eeeeeeee-0000-4000-8000-00000000a9c1', 'android') ->> 'deviceId';
select pg_temp.login('00000000-0000-0000-0000-00000000a9b1');
insert into ctx select 'shopB', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-88888888a9b1","name":"Sync Shop B","businessCategory":"general"}') ->> 'shopId';

-- 1..4 a queued bill is applied once; the same batch again is a replay; the receipt keeps the phone's sale id
select pg_temp.login('00000000-0000-0000-0000-00000000a9a1');
insert into ctx select 'b1', pg_temp.bill('devA', 1, '0190f0f0-0000-7000-8000-00000000a001', pg_temp.quick(10000), 10000)::text;
insert into ctx select 'r1', pg_temp.push('devA', pg_temp.op('create_sale', pg_temp.ctx('b1')::jsonb))::text;
select is(pg_temp.statuses(pg_temp.ctx('r1')::jsonb), '["applied:[]"]'::jsonb, 'a queued bill is applied');
select is((select origin || '/' || status from public.sales where id = (pg_temp.ctx('b1')::jsonb ->> 'saleId')::uuid),
          'offline_sync/completed', 'the bill keeps the phone''s sale id and is marked as synced from offline');
select is(pg_temp.statuses(pg_temp.push('devA', pg_temp.op('create_sale', pg_temp.ctx('b1')::jsonb))),
          '["replayed:[]"]'::jsonb, 'sending the same batch again replays it');
select is((select count(*) from public.sales where shop_id = pg_temp.ctx('shopA')::uuid), 1::bigint, 'still one bill');

-- 5..7 invoice numbers: a gap is flagged, the missing bill arriving later is fine, a used number is quarantined
select is(pg_temp.statuses(pg_temp.push('devA', pg_temp.op('create_sale',
          pg_temp.bill('devA', 3, '0190f0f0-0000-7000-8000-00000000a003', pg_temp.quick(500), 500)))),
          '["needs_review:[\"sequence_gap\"]"]'::jsonb, 'bill 3 before bill 2: saved, gap flagged');
select is(pg_temp.statuses(pg_temp.push('devA', pg_temp.op('create_sale',
          pg_temp.bill('devA', 2, '0190f0f0-0000-7000-8000-00000000a002', pg_temp.quick(500), 500)))),
          '["applied:[]"]'::jsonb, 'bill 2 arriving late is accepted');
select is(pg_temp.statuses(pg_temp.push('devA', pg_temp.op('create_sale',
          pg_temp.bill('devA', 2, '0190f0f0-0000-7000-8000-00000000a004', pg_temp.quick(500), 500)))),
          '["quarantined:DS_INVOICE_SEQUENCE_CONFLICT"]'::jsonb, 'a number already used by another bill is quarantined');

-- 8..12 offline policy breaches are saved and flagged instead of refused
select public.save_product(pg_temp.ctx('shopA')::uuid, jsonb_build_object('id', pg_temp.ctx('salt'), 'name', 'Salt',
  'unitCode', 'pc', 'pricePaise', 2200, 'barcodes', '[]'::jsonb, 'aliases', '[]'::jsonb));
select is(pg_temp.statuses(pg_temp.push('devA',
          pg_temp.op('create_sale', pg_temp.bill('devA', 4, '0190f0f0-0000-7000-8000-00000000a005', pg_temp.item('salt', 2000), 2000)),
          pg_temp.op('create_sale', pg_temp.bill('devA', 5, '0190f0f0-0000-7000-8000-00000000a006', pg_temp.item('salt', 1900), 1900)))),
          '["applied:[]", "needs_review:[\"price_changed\"]"]'::jsonb,
          'an older catalogue price is accepted; a price that never existed is flagged');
select is(pg_temp.statuses(pg_temp.push('devA', pg_temp.op('create_sale',
          pg_temp.bill('devA', 6, '0190f0f0-0000-7000-8000-00000000a007', pg_temp.item('sugar', 4500), 4500)))),
          '["needs_review:[\"negative_stock\"]"]'::jsonb, 'stock below zero with policy "block": saved and flagged');
select is((select stock_on_hand_milli from public.products where id = pg_temp.ctx('sugar')::uuid), -1000::bigint,
          'the sale still moved stock');
select public.archive_product(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('old')::uuid);
select is(pg_temp.statuses(pg_temp.push('devA', pg_temp.op('create_sale',
          pg_temp.bill('devA', 7, '0190f0f0-0000-7000-8000-00000000a008', pg_temp.item('old', 1000), 1000, now() - interval '40 days')))),
          '["needs_review:[\"clock_skew\", \"product_archived\"]"]'::jsonb,
          'an archived item and a phone clock 40 days off: saved and flagged');
select is((select business_date from public.sales where client_operation_id = '0190f0f0-0000-7000-8000-00000000a008'),
          pg_temp.ctx('today')::date, 'with a wrong clock the bill counts for today');

-- 13..15 one failure does not undo the others
insert into ctx select 'mixed', pg_temp.push('devA',
  pg_temp.op('create_sale', pg_temp.bill('devA', 8, '0190f0f0-0000-7000-8000-00000000a009', pg_temp.quick(700), 700)),
  pg_temp.op('create_sale', pg_temp.bill('devA', 9, '0190f0f0-0000-7000-8000-00000000a010', pg_temp.quick(700), 700, now(), null, 800)),
  pg_temp.op('create_sale', pg_temp.bill('devA', 10, '0190f0f0-0000-7000-8000-00000000a011', pg_temp.quick(700), 700)))::text;
select is(pg_temp.statuses(pg_temp.ctx('mixed')::jsonb), '["applied:[]", "quarantined:DS_TOTAL_MISMATCH", "needs_review:[\"sequence_gap\"]"]'::jsonb,
          'a bill with wrong totals is quarantined; the bills around it are saved');
select is((select count(*) from public.sales where client_operation_id in
          ('0190f0f0-0000-7000-8000-00000000a009', '0190f0f0-0000-7000-8000-00000000a010', '0190f0f0-0000-7000-8000-00000000a011')),
          2::bigint, 'nothing of the quarantined bill was saved');
select is(pg_temp.statuses(public.sync_push(jsonb_build_object('shopId', pg_temp.ctx('shopA'), 'deviceId', pg_temp.ctx('devA'),
          'operations', jsonb_build_array(pg_temp.op('create_sale',
             pg_temp.bill('devA', 11, '0190f0f0-0000-7000-8000-00000000a012', pg_temp.quick(100), 100)
             || jsonb_build_object('shopId', pg_temp.ctx('shopB'))))))),
          '["quarantined:DS_VALIDATION_FAILED"]'::jsonb, 'an operation for another shop is refused');

-- 16..22 customers added on two phones with the same number are merged; queued udhaar reaches the right customer
select pg_temp.login('00000000-0000-0000-0000-00000000a9c1');
select is(pg_temp.statuses(pg_temp.push('devC', pg_temp.op('create_customer', jsonb_build_object(
          'id', pg_temp.ctx('raju'), 'shopId', pg_temp.ctx('shopA'), 'name', 'Raju', 'phone', '+919855555555')))),
          '["applied"]'::jsonb, 'a cashier''s offline quick add is applied');
select is(pg_temp.statuses(pg_temp.push('devC', pg_temp.op('create_customer', jsonb_build_object(
          'id', pg_temp.ctx('raju'), 'shopId', pg_temp.ctx('shopA'), 'name', 'Raju', 'phone', '+919855555555')))),
          '["applied"]'::jsonb, 'sending the quick add again is harmless');
select pg_temp.login('00000000-0000-0000-0000-00000000a9a1');
insert into ctx select 'merge', pg_temp.push('devA', pg_temp.op('create_customer', jsonb_build_object(
  'id', pg_temp.ctx('raju2'), 'shopId', pg_temp.ctx('shopA'), 'name', 'Raju bhai', 'phone', '+919855555555')))::text;
select is(pg_temp.ctx('merge')::jsonb -> 'results' -> 0 -> 'result' ->> 'id', pg_temp.ctx('raju'),
          'the same phone added on another phone becomes the existing customer');
select is(pg_temp.statuses(pg_temp.push('devA',
          pg_temp.op('create_sale', pg_temp.bill('devA', 11, '0190f0f0-0000-7000-8000-00000000a013', pg_temp.quick(30000), 30000, now(), 'raju2')),
          pg_temp.op('record_customer_repayment', jsonb_build_object('clientOperationId', '0190f0f0-0000-7000-8000-00000000a101',
             'shopId', pg_temp.ctx('shopA'), 'deviceId', pg_temp.ctx('devA'), 'customerId', pg_temp.ctx('raju2'),
             'amountPaise', 10000, 'method', 'cash')))),
          '["applied:[]", "applied"]'::jsonb, 'udhaar and a repayment queued against the merged id are applied');
select is((select balance_paise from public.customers where id = pg_temp.ctx('raju')::uuid), 20000::bigint,
          'they reached the existing customer: ₹300 − ₹100');
select is((select count(*) from public.customers where shop_id = pg_temp.ctx('shopA')::uuid), 1::bigint,
          'no duplicate customer was created');
select is(public.check_customer_drift(pg_temp.ctx('shopA')::uuid), '[]'::jsonb, 'balance still equals the ledger');

-- 23 credit limit with policy "block" offline: saved and flagged
select public.save_customer(jsonb_build_object('id', pg_temp.ctx('raju'), 'shopId', pg_temp.ctx('shopA'), 'name', 'Raju',
  'phone', '+919855555555', 'creditLimitPaise', 25000));
select is(pg_temp.statuses(pg_temp.push('devA', pg_temp.op('create_sale',
          pg_temp.bill('devA', 12, '0190f0f0-0000-7000-8000-00000000a014', pg_temp.quick(10000), 10000, now(), 'raju')))),
          '["needs_review:[\"credit_limit\"]"]'::jsonb, 'over the credit limit offline: saved and flagged');

-- 24 a bill tried online whose answer was lost, then sent from the queue, is the same bill (ADR-055)
insert into ctx select 'b13', pg_temp.bill('devA', 13, '0190f0f0-0000-7000-8000-00000000a015', pg_temp.quick(900), 900)::text;
select public.create_sale(pg_temp.ctx('b13')::jsonb || '{"origin":"online"}');
select is(pg_temp.statuses(pg_temp.push('devA', pg_temp.op('create_sale', pg_temp.ctx('b13')::jsonb))), '["replayed:[]"]'::jsonb,
          'the queued copy of an online bill replays it');

-- 25..26 a deactivated cashier's queued bills are quarantined, not lost and not failing the batch
select public.deactivate_member(pg_temp.ctx('shopA')::uuid, '00000000-0000-0000-0000-00000000a9c1');
select pg_temp.login('00000000-0000-0000-0000-00000000a9c1');
select is(pg_temp.statuses(pg_temp.push('devC',
          pg_temp.op('create_sale', pg_temp.bill('devC', 1, '0190f0f0-0000-7000-8000-00000000a201', pg_temp.quick(400), 400)),
          pg_temp.op('create_sale', pg_temp.bill('devC', 2, '0190f0f0-0000-7000-8000-00000000a202', pg_temp.quick(400), 400)))),
          '["quarantined:DS_NOT_A_MEMBER", "quarantined:DS_NOT_A_MEMBER"]'::jsonb,
          'a deactivated member''s bills come back quarantined');
select pg_temp.login('00000000-0000-0000-0000-00000000a9a1');
select is(jsonb_array_length(public.list_sales(pg_temp.ctx('shopA')::uuid, null, null, 'needs_review') -> 'items'), 6,
          'the owner sees the six flagged bills in the sales list');

-- 27..32 sync_pull
-- Everything here runs in one transaction (one now()); age the rows so a later change has a newer timestamp.
reset role;
alter table public.products disable trigger products_updated_at;
update public.products set updated_at = updated_at - interval '1 minute' where shop_id = pg_temp.ctx('shopA')::uuid;
alter table public.products enable trigger products_updated_at;
select pg_temp.login('00000000-0000-0000-0000-00000000a9a1');
insert into ctx select 'pull', public.sync_pull(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('devA')::uuid)::text;
select is((select jsonb_agg(r ->> 'name' || coalesce(' (archived)', '') order by r ->> 'name')
             from jsonb_array_elements(pg_temp.ctx('pull')::jsonb -> 'products' -> 'rows') r
            where r ->> 'archivedAt' is not null), '["Old item (archived)"]'::jsonb,
          'the first pull includes archived items so the phone can drop them');
select is(jsonb_array_length(pg_temp.ctx('pull')::jsonb -> 'products' -> 'rows'), 3, 'the first pull returns all items');
select is(pg_temp.ctx('pull')::jsonb -> 'customerAliases' -> 'rows',
          jsonb_build_array(jsonb_build_object('aliasId', pg_temp.ctx('raju2'), 'customerId', pg_temp.ctx('raju'))),
          'the phone learns which local customer id was merged');
select save_product_result is not null as x from (select public.save_product(pg_temp.ctx('shopA')::uuid, jsonb_build_object(
  'id', pg_temp.ctx('salt'), 'name', 'Salt 1kg', 'unitCode', 'pc', 'pricePaise', 2200, 'barcodes', '[]'::jsonb,
  'aliases', '[]'::jsonb)) as save_product_result) s;
select is((select jsonb_agg(r ->> 'name') from jsonb_array_elements(public.sync_pull(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('devA')::uuid,
            jsonb_build_object('products', pg_temp.ctx('pull')::jsonb -> 'products' ->> 'cursor')) -> 'products' -> 'rows') r),
          '["Salt 1kg"]'::jsonb, 'the next pull returns only what changed since the cursor');
select is(public.sync_pull(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('devA')::uuid, '{}', 2) -> 'products' ->> 'more', 'true',
          'a page that is full says there is more');
select pg_temp.login('00000000-0000-0000-0000-00000000a9b1');
select throws_ok($$ select public.sync_pull(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('devA')::uuid) $$,
  'P0001', 'DS_NOT_A_MEMBER', 'another shop''s owner cannot pull shop A');

select * from finish();
rollback;
