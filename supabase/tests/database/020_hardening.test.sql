-- Phase 13: the pre-request gate (minimum app version, maintenance write block, rate limits), retention, system health.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create function pg_temp.login(p_user uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
-- What PostgREST sets before calling the pre-request hook.
create function pg_temp.request(p_rpc text, p_version text default null, p_method text default 'POST')
returns void language plpgsql as $$
begin
  perform set_config('request.method', p_method, true);
  perform set_config('request.path', '/rpc/' || p_rpc, true);
  perform set_config('request.headers',
    case when p_version is null then '{}' else json_build_object('x-ds-app-version', p_version)::text end, true);
end;
$$;
create function pg_temp.set_config_value(p_key text, p_value jsonb) returns void language sql security definer as $$
  update public.platform_config set value = p_value where key = p_key
$$;
create function pg_temp.call_times(p_n integer) returns integer language plpgsql as $$
begin
  for i in 1..p_n loop
    perform public.check_request();
  end loop;
  return p_n;
end;
$$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users (id, phone, email, phone_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000e1a1', '919400000501', null, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e151', null, 'super13@ops.test', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e191', null, 'support13@ops.test', now(), 'authenticated', 'authenticated');
insert into public.platform_admins (user_id, role) values
  ('00000000-0000-0000-0000-00000000e151', 'super_admin'),
  ('00000000-0000-0000-0000-00000000e191', 'support_agent');

-- 1..5 minimum app version
select pg_temp.set_config_value('app.min_supported_version', '"1.4.0"');
select pg_temp.login('00000000-0000-0000-0000-00000000e1a1');
select pg_temp.request('create_sale', '1.3.9');
select throws_ok($$ select public.check_request() $$, 'P0001', 'DS_APP_VERSION_UNSUPPORTED',
  'an app older than the minimum cannot write');
select pg_temp.request('get_client_config', '1.3.9');
select is(public.check_request()::text, '', 'it can still fetch the config to show the update screen');
select pg_temp.request('sync_push', '1.3.9');
select is(public.check_request()::text, '', 'and push bills it already recorded offline');
select pg_temp.request('create_sale', '1.4.0');
select is(public.check_request()::text, '', 'the minimum version itself passes');
select pg_temp.request('create_sale', null);
select is(public.check_request()::text, '', 'callers without the header (admin panel) are not version-gated');

-- 6..9 maintenance with blocksWrites
select pg_temp.set_config_value('app.min_supported_version', '"0.0.0"');
select pg_temp.set_config_value('maintenance',
  '{"active": true, "message": {"en": "Upgrading the database"}, "blocksWrites": true}');
select pg_temp.request('create_sale', '1.5.0');
select throws_ok($$ select public.check_request() $$, 'P0001', 'DS_MAINTENANCE', 'writes are refused during maintenance');
select pg_temp.request('get_shop_entitlements', '1.5.0');
select is(public.check_request()::text, '', 'reads still work');
select pg_temp.request('admin_set_config', null);
select is(public.check_request()::text, '', 'operators can still end the maintenance');
select pg_temp.request('create_sale', '1.5.0', 'GET');
select is(public.check_request()::text, '', 'only RPC calls are gated');
select pg_temp.set_config_value('maintenance', '{"active": false, "message": {"en": ""}, "blocksWrites": false}');

-- 10..12 rate limits
select pg_temp.request('create_support_ticket', '1.5.0');
select is(pg_temp.call_times(10), 10, 'ten tickets an hour are allowed');
select throws_ok($$ select public.check_request() $$, 'P0001', 'DS_RATE_LIMITED', 'the eleventh is refused');
select pg_temp.login('00000000-0000-0000-0000-00000000e151', 'aal2');
select is(public.check_request()::text, '', 'limits are per user');

-- 13..14 system health
select is((public.admin_system_health() ->> 'rateLimitReached1h')::int, 1, 'operators see that someone hit a limit');
select pg_temp.login('00000000-0000-0000-0000-00000000e1a1');
select throws_ok($$ select public.admin_system_health() $$, 'P0001', 'DS_PERMISSION_DENIED',
  'shop users cannot read system health');

-- 15..16 retention
reset role;
insert into private.idempotency_keys (scope_id, client_operation_id, operation, request_hash, result, created_at)
values ('00000000-0000-0000-0000-00000000e1a1', '0190f0f0-0000-7000-8000-00000000e301', 'test', 'h', '{}',
        now() - interval '200 days'),
       ('00000000-0000-0000-0000-00000000e1a1', '0190f0f0-0000-7000-8000-00000000e302', 'test', 'h', '{}', now());
select is((private.run_retention() ->> 'idempotencyKeys')::int, 1, 'idempotency records older than 180 days are removed');
select is((select count(*)::int from private.idempotency_keys
            where client_operation_id = '0190f0f0-0000-7000-8000-00000000e302'), 1, 'recent ones are kept');

select * from finish();
rollback;
