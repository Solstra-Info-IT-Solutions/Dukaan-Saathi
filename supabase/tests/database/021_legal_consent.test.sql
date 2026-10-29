-- Phase 14: legal links in config, terms acceptance per user.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function pg_temp.login(p_user uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function pg_temp.legal_rev() returns integer language sql security definer as $$
  select revision from public.platform_config where key = 'legal' $$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users (id, phone, email, phone_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000f4a1', '919400000601', null, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f451', null, 'super14@ops.test', now(), 'authenticated', 'authenticated');
insert into public.platform_admins (user_id, role) values ('00000000-0000-0000-0000-00000000f451', 'super_admin');
insert into public.profiles (id, phone_e164) values ('00000000-0000-0000-0000-00000000f4a1', '+919400000601')
on conflict (id) do nothing;

-- 1..2 nothing published yet: no links in the config, nothing to accept
select is(public.get_client_config() -> 'legal', null, 'no legal links before they are published');
select pg_temp.login('00000000-0000-0000-0000-00000000f4a1');
select throws_ok($$ select public.accept_terms('2026-11') $$, 'P0001', 'DS_CONFLICT', 'nothing to accept yet');

-- 3..4 super admin publishes version 2026-11 (https links required)
select pg_temp.login('00000000-0000-0000-0000-00000000f451', 'aal2');
select throws_ok($$ select public.admin_set_config('legal',
  '{"version": "2026-11", "privacyUrl": "http://dukaansaathi.in/privacy", "termsUrl": "https://dukaansaathi.in/terms"}',
  pg_temp.legal_rev(), 'Publish pilot terms') $$,
  'P0001', 'DS_VALIDATION_FAILED', 'links must be https');
select is(public.admin_set_config('legal',
  '{"version": "2026-11", "privacyUrl": "https://dukaansaathi.in/privacy", "termsUrl": "https://dukaansaathi.in/terms"}',
  pg_temp.legal_rev(), 'Publish pilot terms') -> 'value' ->> 'version',
  '2026-11', 'super admin publishes the pilot terms');

-- 5..9 the user sees and accepts them once
select pg_temp.login('00000000-0000-0000-0000-00000000f4a1');
select is(public.get_client_config() -> 'legal' ->> 'termsUrl', 'https://dukaansaathi.in/terms', 'apps get the links');
select is(public.get_my_consent() ->> 'acceptedVersion', null, 'not accepted yet');
select throws_ok($$ select public.accept_terms('2026-10') $$, 'P0001', 'DS_CONFLICT', 'an old version cannot be accepted');
select is(public.accept_terms('2026-11') ->> 'acceptedVersion', '2026-11', 'the current version is accepted');
reset role;
select is((select count(*)::int from audit.events where action = 'profile.terms_accepted'
            and entity_id = '00000000-0000-0000-0000-00000000f4a1'), 1, 'the acceptance is audited');

select * from finish();
rollback;
