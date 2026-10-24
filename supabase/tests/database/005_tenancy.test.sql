-- Phase 02 tenancy: shop creation, idempotency, isolation (S-01), roles (S-02), entitlement tables (S-05),
-- immediate deactivation (S-10), devices, quotas, settings validation, client config.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- ---------------------------------------------------------------------------
-- Helpers and fixtures
-- ---------------------------------------------------------------------------
create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;

insert into auth.users (id, email, phone, phone_confirmed_at, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', null, '919000000001', now(), null, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', null, '919000000002', now(), null, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c1', null, '919000000003', now(), null, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d1', 'd@test.local', null, null, now(), 'authenticated', 'authenticated');

-- 1
select is((select phone_e164 from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
          '+919000000001', 'profile is created from auth.users with an E.164 phone');

-- ---------------------------------------------------------------------------
-- Owner A creates a shop
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
insert into ctx select 'shopA', public.create_shop(
  '{"clientOperationId":"11111111-1111-7111-8111-111111111111","name":"Sharma Kirana","businessCategory":"kirana"}') ->> 'shopId';

-- 2..5 creation + idempotency
select ok((select v from ctx where k = 'shopA') is not null, 'owner creates a shop');
select is(public.create_shop('{"clientOperationId":"11111111-1111-7111-8111-111111111111","name":"Sharma Kirana","businessCategory":"kirana"}') ->> 'shopId',
          (select v from ctx where k = 'shopA'), 'replaying create_shop returns the same shop');
select is((public.create_shop('{"clientOperationId":"11111111-1111-7111-8111-111111111111","name":"Sharma Kirana","businessCategory":"kirana"}') ->> 'replayed')::boolean,
          true, 'replay is flagged');
select throws_ok($$ select public.create_shop('{"clientOperationId":"11111111-1111-7111-8111-111111111111","name":"Other Shop","businessCategory":"kirana"}') $$,
                 'P0001', 'DS_IDEMPOTENCY_CONFLICT', 'same operation id with a different payload is rejected');

-- 6..7 membership and visibility
select is(public.get_my_context() -> 'memberships' -> 0 ->> 'role', 'owner', 'creator is the owner');
select is((select count(*) from public.shop_settings)::int, 1, 'owner sees their shop settings');

-- 8..11 validation and settings
select throws_ok($$ select public.create_shop('{"clientOperationId":"22222222-2222-7222-8222-222222222222","name":"X","businessCategory":"kirana"}') $$,
                 'P0001', 'DS_VALIDATION_FAILED', 'shop name must be 2..80 characters');
select throws_ok($$ select public.update_shop_settings((select v::uuid from ctx where k = 'shopA'), '{"colour":"red"}') $$,
                 'P0001', 'DS_VALIDATION_FAILED', 'unknown settings keys are rejected');
select throws_ok($$ select public.update_shop_settings((select v::uuid from ctx where k = 'shopA'), '{"invoicePrefix":"ds!"}') $$,
                 '23514', null, 'invalid invoice prefix violates a check constraint');
select is(public.update_shop_settings((select v::uuid from ctx where k = 'shopA'), '{"invoicePrefix":"SK","upiVpa":"sharma@okaxis"}') ->> 'invoicePrefix',
          'SK', 'owner updates settings');

-- 12..14 devices
insert into ctx select 'deviceA', public.register_device((select v::uuid from ctx where k = 'shopA'),
  'aaaaaaaa-0000-4000-8000-000000000001', 'android', 'Counter', '0.2.0') ->> 'deviceId';
select is((select device_code from public.shop_devices where id = (select v::uuid from ctx where k = 'deviceA')), 'A',
          'first device gets code A');
select is(public.register_device((select v::uuid from ctx where k = 'shopA'), 'aaaaaaaa-0000-4000-8000-000000000001', 'android') ->> 'deviceId',
          (select v from ctx where k = 'deviceA'), 're-registering the same installation returns the same device');
insert into ctx select 'deviceB', public.register_device((select v::uuid from ctx where k = 'shopA'),
  'aaaaaaaa-0000-4000-8000-000000000002', 'android') ->> 'deviceId';
select is((select device_code from public.shop_devices where id = (select v::uuid from ctx where k = 'deviceB')), 'B',
          'second device gets code B');

-- 15 invite cashier C by phone
insert into ctx select 'inviteC', public.invite_shop_member((select v::uuid from ctx where k = 'shopA'), 'cashier', '+919000000003') ->> 'invitationId';
select ok((select v from ctx where k = 'inviteC') is not null, 'owner invites a cashier by phone');

-- ---------------------------------------------------------------------------
-- Other tenant B
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
insert into ctx select 'shopB', public.create_shop(
  '{"clientOperationId":"33333333-3333-7333-8333-333333333333","name":"Gupta General","businessCategory":"general"}') ->> 'shopId';

-- 16..20
select ok((select v from ctx where k = 'shopB') is not null, 'second owner creates their own shop');
select is((select count(*) from public.shops where id = (select v::uuid from ctx where k = 'shopA'))::int, 0,
          'shop B owner cannot see shop A');
select throws_ok($$ select public.update_shop_settings((select v::uuid from ctx where k = 'shopA'), '{"roundOffEnabled":true}') $$,
                 'P0001', 'DS_NOT_A_MEMBER', 'shop B owner cannot change shop A settings');
select throws_ok($$ select public.accept_shop_invitation((select v::uuid from ctx where k = 'inviteC')) $$,
                 'P0001', 'DS_NOT_FOUND', 'an invitation addressed to someone else cannot be accepted');
select is((select count(*) from public.shop_members where shop_id = (select v::uuid from ctx where k = 'shopA'))::int, 0,
          'shop B owner cannot list shop A members');

-- ---------------------------------------------------------------------------
-- Cashier C
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');

-- 21..29
select is(jsonb_array_length(public.get_my_context() -> 'invitations'), 1, 'invitee sees the pending invitation');
select is(public.accept_shop_invitation((select v::uuid from ctx where k = 'inviteC')) ->> 'role', 'cashier', 'invitee accepts as cashier');
select ok(not (public.get_my_context() -> 'memberships' -> 0 -> 'permissions' ? 'sale.void'), 'cashier cannot void sales');
select throws_ok($$ select public.update_shop_settings((select v::uuid from ctx where k = 'shopA'), '{"roundOffEnabled":true}') $$,
                 'P0001', 'DS_PERMISSION_DENIED', 'cashier cannot change settings');
select throws_ok($$ select public.invite_shop_member((select v::uuid from ctx where k = 'shopA'), 'cashier', '+919000000009') $$,
                 'P0001', 'DS_PERMISSION_DENIED', 'cashier cannot invite staff');
select throws_ok($$ insert into public.shops (name, business_category, created_by, client_operation_id)
                    values ('Hack', 'kirana', auth.uid(), gen_random_uuid()) $$,
                 '42501', null, 'clients cannot insert shops directly');
select throws_ok($$ update public.shop_settings set round_off_enabled = true $$,
                 '42501', null, 'clients cannot update settings directly');
select throws_ok($$ select * from public.plan_entitlements $$, '42501', null, 'clients cannot read plan entitlements (S-05)');
select throws_ok($$ insert into public.shop_entitlement_overrides (shop_id, entitlement_key, value, reason)
                    values ((select v::uuid from ctx where k = 'shopA'), 'products.max', 'null', 'free stuff') $$,
                 '42501', null, 'clients cannot grant themselves entitlements (S-05)');

-- ---------------------------------------------------------------------------
-- Owner A: entitlements, quota, last-owner guard, deactivation, device revoke
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');

-- 30..31
select is(public.get_shop_entitlements((select v::uuid from ctx where k = 'shopA')) ->> 'planCode', 'free_trial',
          'new shop is on the free trial');
select is((public.get_shop_entitlements((select v::uuid from ctx where k = 'shopA')) -> 'usage' ->> 'staff_accounts.max')::int, 1,
          'staff usage counts the cashier');

reset role;
insert into public.shop_entitlement_overrides (shop_id, entitlement_key, value, reason)
values ((select v::uuid from ctx where k = 'shopA'), 'staff_accounts.max', '1', 'test: limit staff to one');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');

-- 32..33
select throws_ok($$ select public.invite_shop_member((select v::uuid from ctx where k = 'shopA'), 'manager', null, 'd@test.local') $$,
                 'P0001', 'DS_QUOTA_EXCEEDED', 'staff quota is enforced on the server');
select throws_ok($$ select public.update_member_role((select v::uuid from ctx where k = 'shopA'), '00000000-0000-0000-0000-0000000000a1', 'manager') $$,
                 'P0001', 'DS_VALIDATION_FAILED', 'the last active owner cannot be demoted');

-- 34..35 deactivation is immediate
select public.deactivate_member((select v::uuid from ctx where k = 'shopA'), '00000000-0000-0000-0000-0000000000c1');
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select is(jsonb_array_length(public.get_my_context() -> 'memberships'), 0, 'deactivated member loses the membership at once (S-10)');
select is((select count(*) from public.shops where id = (select v::uuid from ctx where k = 'shopA'))::int, 0,
          'deactivated member can no longer read the shop');

-- 36 revoked device cannot come back
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select public.revoke_device((select v::uuid from ctx where k = 'shopA'), (select v::uuid from ctx where k = 'deviceB'));
select throws_ok($$ select public.register_device((select v::uuid from ctx where k = 'shopA'), 'aaaaaaaa-0000-4000-8000-000000000002', 'android') $$,
                 'P0001', 'DS_DEVICE_NOT_REGISTERED', 'a revoked device cannot re-register');

-- 37..38 trial expiry falls back to the free tier
reset role;
update public.shop_subscriptions set trial_ends_at = now() - interval '1 day'
 where shop_id = (select v::uuid from ctx where k = 'shopA');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select is(public.get_shop_entitlements((select v::uuid from ctx where k = 'shopA')) ->> 'planCode', 'free_tier',
          'expired trial resolves to the free tier');
select is(public.get_shop_entitlements((select v::uuid from ctx where k = 'shopA')) ->> 'subscriptionStatus', 'expired',
          'expired trial reports status expired');

-- 39 suspended shop
reset role;
update public.shops set status = 'suspended' where id = (select v::uuid from ctx where k = 'shopA');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.get_shop_settings((select v::uuid from ctx where k = 'shopA')) $$,
                 'P0001', 'DS_SHOP_SUSPENDED', 'suspended shop blocks shop RPCs');

-- 40..41 anon
reset role;
set local role anon;
select is(public.get_client_config() ->> 'minSupportedAppVersion', '0.0.0', 'anon can read the public client config');
select throws_ok($$ select public.get_my_context() $$, '42501', null, 'anon cannot call get_my_context');
reset role;

-- 42 audit trail
select ok((select count(*) from audit.events where shop_id = (select v::uuid from ctx where k = 'shopA')) >= 6,
          'sensitive shop actions are audited');

select * from finish();
rollback;
