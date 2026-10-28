-- Phase 12: plan and entitlement editing enforced immediately, overrides, feature flags (rollout, overrides, kill
-- switch, app version, revisions), platform config with rollback, lifecycle job, verified payment events,
-- S-04 / S-05 / S-09.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

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
create function pg_temp.flag(p_shop text, p_key text, p_version text) returns boolean
  language sql security definer as $$ select private.flag_enabled(p_shop::uuid, p_key, p_version) $$;
grant execute on all functions in schema pg_temp to public;

-- Shop owner (a1); operators: super (s1), billing (b1), billing without MFA (b2), support (p1), analyst (n1).
insert into auth.users (id, phone, email, phone_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000d1a1', '919400000401', null, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d151', null, 'super12@ops.test', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d1b1', null, 'billing@ops.test', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d1b2', null, 'billing-nomfa@ops.test', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d191', null, 'support12@ops.test', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d1e1', null, 'analyst@ops.test', now(), 'authenticated', 'authenticated');
insert into public.platform_admins (user_id, role) values
  ('00000000-0000-0000-0000-00000000d151', 'super_admin'),
  ('00000000-0000-0000-0000-00000000d1b1', 'billing_admin'),
  ('00000000-0000-0000-0000-00000000d1b2', 'billing_admin'),
  ('00000000-0000-0000-0000-00000000d191', 'support_agent'),
  ('00000000-0000-0000-0000-00000000d1e1', 'analyst');
insert into ctx select 'pro', id::text from public.subscription_plans where code = 'pro';

select pg_temp.login('00000000-0000-0000-0000-00000000d1a1');
insert into ctx select 'shop', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-88888888d1a1","name":"Plan Kirana","businessCategory":"kirana"}') ->> 'shopId';

-- 1..6 S-05 / S-09: no client path writes plans, subscriptions, overrides or flags, or applies payment events
select throws_ok($$ insert into public.plan_entitlements (plan_id, entitlement_key, value)
  values (pg_temp.ctx('pro')::uuid, 'products.max', 'null') $$, '42501', null, 'a shop user cannot write plan entitlements');
select throws_ok($$ insert into public.shop_entitlement_overrides (shop_id, entitlement_key, value, reason)
  values (pg_temp.ctx('shop')::uuid, 'products.max', 'null', 'please') $$, '42501', null,
  'a shop user cannot grant itself an override');
select throws_ok($$ update public.shop_subscriptions set status = 'active' $$, '42501', null,
  'a shop user cannot change its subscription');
select throws_ok($$ insert into public.feature_flags (key) values ('sneaky_flag') $$, '42501', null,
  'a shop user cannot create flags');
select throws_ok($$ insert into public.feature_flag_overrides (shop_id, flag_key, value, reason)
  values (pg_temp.ctx('shop')::uuid, 'voice_billing', true, 'please') $$, '42501', null,
  'a shop user cannot override a flag');
select throws_ok($$ select public.process_verified_subscription_event(jsonb_build_object('provider', 'razorpay',
  'eventId', 'evt_fake', 'shopId', pg_temp.ctx('shop'), 'planCode', 'pro', 'status', 'active')) $$, '42501', null,
  'S-09: a signed-in user cannot apply a payment event');

-- 7..9 trial: full features; the lifecycle job expires it; billing features fall back to the free tier (S-04)
select is(public.get_shop_entitlements(pg_temp.ctx('shop')::uuid) ->> 'planCode', 'free_trial', 'a new shop is on the trial');
reset role;
select is(private.run_subscription_lifecycle(now() + interval '31 days') ->> 'expired', '1',
  'the lifecycle job expires the trial after its end');
select pg_temp.login('00000000-0000-0000-0000-00000000d1a1');
select throws_ok($$ select public.get_sales_report(pg_temp.ctx('shop')::uuid, current_date - 29, current_date, 'day') $$,
  'P0001', 'DS_ENTITLEMENT_REQUIRED', 'S-04: an expired shop cannot open the 30-day report');

-- 10..14 manual plan assignment by billing (MFA and role checked, reason required)
select pg_temp.login('00000000-0000-0000-0000-00000000d1b2', 'aal1');
select throws_ok($$ select public.admin_assign_plan(pg_temp.ctx('shop')::uuid, '{"planCode":"pro"}', 'paid by UPI') $$,
  'P0001', 'DS_MFA_REQUIRED', 'billing without MFA is refused');
select pg_temp.login('00000000-0000-0000-0000-00000000d191', 'aal2');
select throws_ok($$ select public.admin_assign_plan(pg_temp.ctx('shop')::uuid, '{"planCode":"pro"}', 'paid by UPI') $$,
  'P0001', 'DS_PERMISSION_DENIED', 'support cannot assign plans');
select pg_temp.login('00000000-0000-0000-0000-00000000d1b1', 'aal2');
select throws_ok($$ select public.admin_assign_plan(pg_temp.ctx('shop')::uuid, '{"planCode":"pro"}', 'x') $$,
  'P0001', 'DS_VALIDATION_FAILED', 'a reason is required');
select is(public.admin_assign_plan(pg_temp.ctx('shop')::uuid,
  jsonb_build_object('planCode', 'pro', 'periodEnd', now() + interval '30 days'), 'Paid 999 by UPI, ref 123') ->> 'status',
  'active', 'billing assigns the pro plan');
select pg_temp.login('00000000-0000-0000-0000-00000000d1a1');
select is((public.get_shop_entitlements(pg_temp.ctx('shop')::uuid) -> 'entitlements' ->> 'reports.advanced')::boolean, true,
  'the shop has advanced reports at once');

-- 15..19 editing a plan's entitlement is enforced immediately
select pg_temp.login('00000000-0000-0000-0000-00000000d1b1', 'aal2');
select throws_ok($$ select public.admin_set_plan_entitlement(pg_temp.ctx('pro')::uuid, 'reports.advanced', '5') $$,
  'P0001', 'DS_VALIDATION_FAILED', 'a boolean entitlement needs true or false');
select throws_ok($$ select public.admin_set_plan_entitlement(pg_temp.ctx('pro')::uuid, 'products.max', '-1') $$,
  'P0001', 'DS_VALIDATION_FAILED', 'a limit must be a whole number or unlimited');
select is(public.admin_set_plan_entitlement(pg_temp.ctx('pro')::uuid, 'reports.advanced', 'false') ->> 'value', 'false',
  'billing turns advanced reports off for pro');
select pg_temp.login('00000000-0000-0000-0000-00000000d1a1');
select throws_ok($$ select public.get_sales_report(pg_temp.ctx('shop')::uuid, current_date - 29, current_date, 'day') $$,
  'P0001', 'DS_ENTITLEMENT_REQUIRED', 'the plan change is enforced on the next call');
select pg_temp.login('00000000-0000-0000-0000-00000000d1b1', 'aal2');
select is(public.admin_set_plan_entitlement(pg_temp.ctx('pro')::uuid, 'reports.advanced', 'true') ->> 'value', 'true',
  'and back on');

-- 20..24 overrides: a per-shop limit beats the plan until ended
select is(public.admin_set_entitlement_override(pg_temp.ctx('shop')::uuid, 'products.max', '0',
  'Testing a zero product limit') ->> 'value', '0', 'billing sets a per-shop override');
reset role;
insert into ctx select 'override', id::text from public.shop_entitlement_overrides
 where shop_id = pg_temp.ctx('shop')::uuid and expires_at is null;
select pg_temp.login('00000000-0000-0000-0000-00000000d1a1');
select throws_ok($$ select public.save_product(pg_temp.ctx('shop')::uuid, jsonb_build_object(
  'id', '0190f0f0-0000-7000-8000-00000000d001', 'name', 'Rice', 'unitCode', 'kg', 'pricePaise', 6000,
  'barcodes', '[]'::jsonb, 'aliases', '[]'::jsonb)) $$, 'P0001', 'DS_QUOTA_EXCEEDED', 'the override limit is enforced');
select pg_temp.login('00000000-0000-0000-0000-00000000d1b1', 'aal2');
select is(public.admin_end_entitlement_override(pg_temp.ctx('override')::uuid, 'Test finished, remove')::text, '',
  'billing ends the override');
select pg_temp.login('00000000-0000-0000-0000-00000000d1a1');
select is(public.save_product(pg_temp.ctx('shop')::uuid, jsonb_build_object(
  'id', '0190f0f0-0000-7000-8000-00000000d001', 'name', 'Rice', 'unitCode', 'kg', 'pricePaise', 6000,
  'barcodes', '[]'::jsonb, 'aliases', '[]'::jsonb)) ->> 'name', 'Rice', 'the plan limit applies again');
select is((public.get_shop_entitlements(pg_temp.ctx('shop')::uuid) -> 'usage' ->> 'products.max')::int, 1,
  'usage counts the products');

-- 25..33 feature flags: rollout, override, kill switch, app version, roles
select is(public.get_shop_flags(pg_temp.ctx('shop')::uuid, '1.0.0') -> 'flags' ->> 'voice_billing', 'true',
  'voice billing is on for everyone at 100 %');
select pg_temp.login('00000000-0000-0000-0000-00000000d1b1', 'aal2');
select throws_ok($$ select public.admin_save_flag('{"key":"voice_billing","enabled":false}', 'Kill voice now') $$,
  'P0001', 'DS_PERMISSION_DENIED', 'billing cannot change flags');
select pg_temp.login('00000000-0000-0000-0000-00000000d151', 'aal2');
select is(public.admin_save_flag('{"key":"voice_billing","rolloutPercent":0}', 'Pause the rollout') ->> 'rolloutPercent',
  '0', 'super admin sets the rollout to 0 %');
select is(pg_temp.flag(pg_temp.ctx('shop'), 'voice_billing', '1.0.0'), false, 'at 0 % the shop is out');
select is(public.admin_set_flag_override(pg_temp.ctx('shop')::uuid, 'voice_billing', true, 'Pilot shop for voice')::text,
  '', 'super admin turns it on for one shop');
select is(pg_temp.flag(pg_temp.ctx('shop'), 'voice_billing', '1.0.0'), true, 'the override puts the shop in');
select is(public.admin_save_flag('{"key":"voice_billing","enabled":false}', 'Kill switch: crash in parser') ->> 'enabled',
  'false', 'kill switch');
select is(pg_temp.flag(pg_temp.ctx('shop'), 'voice_billing', '1.0.0'), false,
  'the kill switch beats the override');
select throws_ok($$ select public.admin_save_flag('{"key":"offline_sync","enabled":false}', 'Turn off offline') $$,
  'P0001', 'DS_CONFLICT', 'offline sync is not kill-switchable');

-- 34..36 revisions and rollback, app version gate
reset role;
insert into ctx select 'flagrev', id::text from public.config_revisions
 where kind = 'feature_flag' and key = 'voice_billing' and revision = 1;
select pg_temp.login('00000000-0000-0000-0000-00000000d151', 'aal2');
select is(public.admin_restore_revision(pg_temp.ctx('flagrev')::bigint, 'Parser fixed') ->> 'enabled', 'true',
  'restoring revision 1 turns the flag back on');
reset role;
select is((select count(*)::int from public.config_revisions where kind = 'feature_flag' and key = 'voice_billing'), 4,
  'every change is a new revision (1, rollout, kill, restore)');
select pg_temp.login('00000000-0000-0000-0000-00000000d151', 'aal2');
select is(public.admin_set_flag_override(pg_temp.ctx('shop')::uuid, 'voice_billing', null, 'Pilot finished')::text, '',
  'the override is removed');
select is(public.admin_save_flag('{"key":"voice_billing","minAppVersion":"2.0.0"}', 'Needs the new parser')
  ->> 'minAppVersion', '2.0.0', 'minimum app version set');
select is(pg_temp.flag(pg_temp.ctx('shop'), 'voice_billing', '1.9.9'), false, 'older apps do not get it');

-- 38..41 platform config: validation, optimistic revision, rollback
select throws_ok($$ select public.admin_set_config('config.refresh_seconds', '60', 1, 'Faster refresh') $$,
  'P0001', 'DS_VALIDATION_FAILED', 'refresh below 5 minutes is refused');
select throws_ok($$ select public.admin_set_config('anything.goes', '1', 1, 'New key') $$,
  'P0001', 'DS_VALIDATION_FAILED', 'unknown keys are refused');
select is(public.admin_set_config('config.refresh_seconds', '600', 1, 'Faster refresh for pilot') ->> 'revision', '2',
  'super admin changes the refresh interval');
select throws_ok($$ select public.admin_set_config('config.refresh_seconds', '1200', 1, 'Someone else edits') $$,
  'P0001', 'DS_CONFLICT', 'an edit from an old revision is refused');
select is((public.get_client_config() ->> 'refreshSeconds')::int, 600, 'apps receive the new value');

-- 43..45 verified payment event (service role): applied once
reset role;
select is(public.process_verified_subscription_event(jsonb_build_object('provider', 'razorpay', 'eventId', 'evt_1',
  'shopId', pg_temp.ctx('shop'), 'planCode', 'starter', 'status', 'active', 'periodEnd', now() + interval '30 days'))
  ->> 'planCode', 'starter', 'a verified payment moves the shop to starter');
select is(public.process_verified_subscription_event(jsonb_build_object('provider', 'razorpay', 'eventId', 'evt_1',
  'shopId', pg_temp.ctx('shop'), 'planCode', 'pro', 'status', 'active')) ->> 'planCode', 'starter',
  'the same event again returns the first result');

-- lifecycle: active → past_due → grace → expired
update public.shop_subscriptions set current_period_end = now() - interval '1 hour'
 where shop_id = pg_temp.ctx('shop')::uuid and is_current;
select is(concat_ws(',', private.run_subscription_lifecycle(now()) ->> 'past_due',
                         private.run_subscription_lifecycle(now() + interval '3 days') ->> 'grace',
                         private.run_subscription_lifecycle(now() + interval '10 days') ->> 'expired'),
  '1,1,1', 'active → past due → grace → expired');

select is((select count(*)::int from audit.events
  where action in ('admin.subscription_changed', 'admin.plan_entitlement_changed', 'admin.entitlement_override_set',
                   'admin.entitlement_override_ended', 'admin.flag_changed', 'admin.flag_override_changed',
                   'admin.config_changed', 'subscription.status_changed', 'subscription.payment_event')),
  17, 'every change is audited');

select * from finish();
rollback;
