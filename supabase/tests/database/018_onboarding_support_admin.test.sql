-- Phase 11: managed onboarding (request → operator import → owner commit), support tickets with internal notes,
-- announcements, and the admin RPCs (role + MFA checks, masking, audit).
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

create function pg_temp.login(p_user uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;
create function pg_temp.ctx(p_k text) returns text language sql as $$ select v from ctx where k = p_k $$;
grant execute on all functions in schema pg_temp to public;

-- Shop A: owner (a1), cashier (c1). Shop B: owner (b1). Operators: super (s1), onboarding (o1, MFA), onboarding
-- without MFA (o2), support (p1), analyst (n1).
insert into auth.users (id, phone, email, phone_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000c1a1', '919400000301', null, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c1c1', '919400000303', null, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c1b1', '919400000302', null, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c151', null, 'super@ops.test', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c101', null, 'onboard@ops.test', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c102', null, 'nomfa@ops.test', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c191', null, 'support@ops.test', now(), 'authenticated', 'authenticated');
insert into public.platform_admins (user_id, role) values
  ('00000000-0000-0000-0000-00000000c151', 'super_admin'),
  ('00000000-0000-0000-0000-00000000c101', 'onboarding_operator'),
  ('00000000-0000-0000-0000-00000000c102', 'onboarding_operator'),
  ('00000000-0000-0000-0000-00000000c191', 'support_agent');
insert into ctx values ('req', '0190f0f0-0000-7000-8000-00000000c201'), ('req2', '0190f0f0-0000-7000-8000-00000000c202'),
                       ('ticket', '0190f0f0-0000-7000-8000-00000000c301');

select pg_temp.login('00000000-0000-0000-0000-00000000c1a1');
insert into ctx select 'shopA', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-88888888c1a1","name":"Onboard Kirana","businessCategory":"kirana","phone":"+919811122233"}') ->> 'shopId';
insert into ctx select 'invC', public.invite_shop_member(pg_temp.ctx('shopA')::uuid, 'cashier', '+919400000303') ->> 'invitationId';
select pg_temp.login('00000000-0000-0000-0000-00000000c1c1');
select public.accept_shop_invitation(pg_temp.ctx('invC')::uuid);
select pg_temp.login('00000000-0000-0000-0000-00000000c1b1');
insert into ctx select 'shopB', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-88888888c1b1","name":"Other Store","businessCategory":"general"}') ->> 'shopId';

-- 1..7 the owner asks for managed onboarding
select pg_temp.login('00000000-0000-0000-0000-00000000c1a1');
select is(public.create_onboarding_request(jsonb_build_object('id', pg_temp.ctx('req'), 'shopId', pg_temp.ctx('shopA'),
  'method', 'photos', 'contactPhone', '+919811122233', 'preferredTime', 'after 4 pm', 'note', 'about 300 items')) ->> 'status',
  'new', 'an owner submits an onboarding request');
select is(public.create_onboarding_request(jsonb_build_object('id', pg_temp.ctx('req'), 'shopId', pg_temp.ctx('shopA'),
  'method', 'photos')) ->> 'id', pg_temp.ctx('req'), 'submitting the same request again is harmless');
select throws_ok($$ select public.create_onboarding_request(jsonb_build_object('id', pg_temp.ctx('req2'),
  'shopId', pg_temp.ctx('shopA'), 'method', 'call')) $$, 'P0001', 'DS_CONFLICT', 'one open request per shop');
select is(jsonb_array_length(public.add_onboarding_file(jsonb_build_object('shopId', pg_temp.ctx('shopA'),
  'requestId', pg_temp.ctx('req'), 'path', pg_temp.ctx('shopA') || '/' || pg_temp.ctx('req') || '/shelf1.jpg',
  'fileName', 'shelf1.jpg', 'mimeType', 'image/jpeg', 'sizeBytes', 120000)) -> 'files'), 1, 'a photo is attached');
select throws_ok($$ select public.add_onboarding_file(jsonb_build_object('shopId', pg_temp.ctx('shopA'),
  'requestId', pg_temp.ctx('req'), 'path', pg_temp.ctx('shopB') || '/x/evil.jpg', 'fileName', 'evil.jpg',
  'mimeType', 'image/jpeg', 'sizeBytes', 10)) $$, 'P0001', 'DS_VALIDATION_FAILED', 'a file outside the request folder is refused');
select pg_temp.login('00000000-0000-0000-0000-00000000c1c1');
select throws_ok($$ select public.create_onboarding_request(jsonb_build_object('id', pg_temp.ctx('req2'),
  'shopId', pg_temp.ctx('shopA'), 'method', 'call')) $$, 'P0001', 'DS_PERMISSION_DENIED', 'a cashier cannot request onboarding');
select pg_temp.login('00000000-0000-0000-0000-00000000c1b1');
select is((select count(*) from public.onboarding_requests), 0::bigint, 'another shop cannot see the request');

-- 8..11 who may open the onboarding queue
select pg_temp.login('00000000-0000-0000-0000-00000000c102', 'aal1');
select throws_ok($$ select public.admin_list_onboarding() $$, 'P0001', 'DS_MFA_REQUIRED', 'an operator without MFA is refused');
select pg_temp.login('00000000-0000-0000-0000-00000000c191', 'aal2');
select throws_ok($$ select public.admin_list_onboarding() $$, 'P0001', 'DS_PERMISSION_DENIED', 'support agents cannot open onboarding');
select pg_temp.login('00000000-0000-0000-0000-00000000c1a1', 'aal2');
select throws_ok($$ select public.admin_list_onboarding() $$, 'P0001', 'DS_PERMISSION_DENIED', 'a shop owner is not an operator');
select pg_temp.login('00000000-0000-0000-0000-00000000c101', 'aal2');
select is((select jsonb_agg(r ->> 'shopName') from jsonb_array_elements(public.admin_list_onboarding()) r),
          '["Onboard Kirana"]'::jsonb, 'the onboarding operator sees the request');

-- 12..18 operator builds the import, the owner reviews and commits it
select throws_ok($$ select public.admin_update_onboarding(pg_temp.ctx('req')::uuid, '{"status":"awaiting_owner"}') $$,
  'P0001', 'DS_CONFLICT', 'status steps follow the workflow');
select is(public.admin_update_onboarding(pg_temp.ctx('req')::uuid, '{"status":"assigned"}') ->> 'status', 'assigned',
          'the operator takes the request');
insert into ctx select 'job', public.admin_create_import_job(pg_temp.ctx('req')::uuid, 'shelf-photos.csv',
  '0190f0f0-0000-7000-8000-00000000c401') ->> 'jobId';
select is(public.admin_stage_import_rows(pg_temp.ctx('req')::uuid,
  '[{"rowNumber":1,"name":"Aashirvaad Atta 5kg","unit":"pcs","price":"250"},{"rowNumber":2,"name":"Tata Salt","unit":"pkt","price":"28"}]')
  ->> 'validCount', '2', 'rows typed from the photos are staged into the shop''s import');
select throws_ok($$ select public.add_product_alias(pg_temp.ctx('shopA')::uuid, gen_random_uuid(), 'atta') $$,
  'P0001', 'DS_NOT_A_MEMBER', 'operators cannot change the catalogue directly');
select is(public.admin_update_onboarding(pg_temp.ctx('req')::uuid, '{"status":"awaiting_owner","statusNote":"Please check prices"}')
          ->> 'status', 'awaiting_owner', 'sent to the owner for approval');
select pg_temp.login('00000000-0000-0000-0000-00000000c1a1');
select is(public.get_import_job(pg_temp.ctx('job')::uuid) ->> 'validCount', '2', 'the owner sees the prepared import');
select is(public.commit_product_import(pg_temp.ctx('job')::uuid, '0190f0f0-0000-7000-8000-00000000c402') ->> 'created', '2',
          'the owner approves: two items created');
select is((select status from public.onboarding_requests where id = pg_temp.ctx('req')::uuid), 'completed',
          'committing completes the request');

-- 19..25 support tickets
select pg_temp.login('00000000-0000-0000-0000-00000000c1c1');
select is(public.create_support_ticket(jsonb_build_object('id', pg_temp.ctx('ticket'), 'shopId', pg_temp.ctx('shopA'),
  'subject', 'Bills not syncing', 'category', 'sync', 'body', 'Two bills show waiting since morning')) ->> 'status',
  'waiting_support', 'a cashier opens a ticket');
select pg_temp.login('00000000-0000-0000-0000-00000000c191', 'aal2');
select is((select count(*) from jsonb_array_elements(public.admin_list_tickets()) t where t ->> 'id' = pg_temp.ctx('ticket')),
          1::bigint, 'support sees it in the queue');
select public.admin_reply_ticket(pg_temp.ctx('ticket')::uuid, 'Please open Sync status and tap Sync now.');
select is(public.admin_reply_ticket(pg_temp.ctx('ticket')::uuid, 'Device clock was wrong; check logs', true) ->> 'status',
          'waiting_shop', 'a reply waits for the shop; an internal note does not change that');
select pg_temp.login('00000000-0000-0000-0000-00000000c1c1');
select is((select jsonb_agg(author_kind order by created_at) from public.support_messages), '["shop", "operator"]'::jsonb,
          'the shop sees its message and the reply, never the internal note');
select is(public.add_ticket_message(jsonb_build_object('shopId', pg_temp.ctx('shopA'), 'ticketId', pg_temp.ctx('ticket'),
  'body', 'Done, thanks')) ->> 'status', 'waiting_support', 'the shop''s reply goes back to support');
select pg_temp.login('00000000-0000-0000-0000-00000000c1a1');
select is((select count(*) from public.support_tickets), 1::bigint, 'the owner sees the staff''s ticket');
select pg_temp.login('00000000-0000-0000-0000-00000000c101', 'aal2');
select throws_ok($$ select public.admin_list_tickets() $$, 'P0001', 'DS_PERMISSION_DENIED',
  'onboarding operators cannot read tickets');

-- 26..31 shops
select pg_temp.login('00000000-0000-0000-0000-00000000c191', 'aal2');
select is((select i ->> 'phone' from jsonb_array_elements(public.admin_list_shops('onboard') -> 'items') i),
          '+9198XXXXX233', 'shops are searchable; phone numbers are masked');
insert into ctx select 'detail', public.admin_get_shop(pg_temp.ctx('shopA')::uuid)::text;
select ok(pg_temp.ctx('detail') not like '%9400000301%', 'member phone numbers are not shown in full');
select is(pg_temp.ctx('detail')::jsonb -> 'usage' ->> 'products', '2', 'usage counts are shown');
select throws_ok($$ select public.admin_set_shop_status(pg_temp.ctx('shopA')::uuid, 'suspended', 'Fraud report') $$,
  'P0001', 'DS_PERMISSION_DENIED', 'support cannot suspend a shop');
select throws_ok($$ select public.admin_deactivate_member(pg_temp.ctx('shopA')::uuid, '00000000-0000-0000-0000-00000000c1a1', 'Lost phone') $$,
  'P0001', 'DS_CONFLICT', 'the owner cannot be deactivated by support');
select pg_temp.login('00000000-0000-0000-0000-00000000c151', 'aal2');
select public.admin_set_shop_status(pg_temp.ctx('shopA')::uuid, 'suspended', 'Payment dispute');
select pg_temp.login('00000000-0000-0000-0000-00000000c1a1');
select throws_ok($$ select public.add_ticket_message(jsonb_build_object('shopId', pg_temp.ctx('shopA'),
  'ticketId', pg_temp.ctx('ticket'), 'body', 'hello')) $$, 'P0001', 'DS_SHOP_SUSPENDED', 'a suspended shop cannot be used');
select pg_temp.login('00000000-0000-0000-0000-00000000c151', 'aal2');
select public.admin_set_shop_status(pg_temp.ctx('shopA')::uuid, 'active', 'Dispute settled');

-- 32..34 announcements
select pg_temp.login('00000000-0000-0000-0000-00000000c191', 'aal2');
select public.admin_save_announcement('{"title":{"en":"New: voice billing","hi":"नया: आवाज़ से बिल"},"status":"published"}');
select public.admin_save_announcement('{"title":{"en":"Draft only"},"status":"draft"}');
select throws_ok($$ select public.admin_save_announcement('{"title":{"en":"Outage"},"severity":"critical","status":"published"}') $$,
  'P0001', 'DS_PERMISSION_DENIED', 'only a super admin publishes a critical announcement');
select pg_temp.login('00000000-0000-0000-0000-00000000c1c1');
select is((select jsonb_agg(a -> 'title' ->> 'en') from jsonb_array_elements(public.get_announcements()) a),
          '["New: voice billing"]'::jsonb, 'shops see published announcements only');
reset role;
select is((select count(*) from audit.events where actor_kind = 'platform_admin' and action like 'admin.%'), 10::bigint,
          'every admin change and shop view is audited');

-- 35..38 operators, metrics, audit log
select pg_temp.login('00000000-0000-0000-0000-00000000c151', 'aal2');
select throws_ok($$ select public.admin_set_operator_role('00000000-0000-0000-0000-00000000c151', 'analyst', null, 'Testing myself') $$,
  'P0001', 'DS_CONFLICT', 'a super admin cannot demote themselves');
select is(public.admin_set_operator_role('00000000-0000-0000-0000-00000000c102', null, 'disabled', 'Left the team') ->> 'status',
          'disabled', 'an operator is disabled with a reason');
select is((public.admin_dashboard_metrics() ->> 'openTickets')::int, 1, 'the dashboard counts open tickets');
reset role;
insert into auth.users (id, email, aud, role) values ('00000000-0000-0000-0000-00000000c1f1', 'new@ops.test', 'authenticated', 'authenticated');
select pg_temp.login('00000000-0000-0000-0000-00000000c151', 'aal2');
select is(public.admin_add_operator('00000000-0000-0000-0000-00000000c1f1', 'analyst') ->> 'role', 'analyst',
          'a super admin adds an invited user as an operator');
select pg_temp.login('00000000-0000-0000-0000-00000000c101', 'aal2');
select throws_ok($$ select public.admin_add_operator('00000000-0000-0000-0000-00000000c1f1', 'super_admin') $$,
  'P0001', 'DS_PERMISSION_DENIED', 'other operators cannot add operators');
select pg_temp.login('00000000-0000-0000-0000-00000000c191', 'aal2');
select throws_ok($$ select public.admin_list_audit_log() $$, 'P0001', 'DS_PERMISSION_DENIED', 'only super admins read the audit log');

select * from finish();
rollback;
