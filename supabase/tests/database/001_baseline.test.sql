-- Baseline security: schemas, privileges, audit append-only, platform role lookup.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Schemas exist and are not usable by client roles.
select has_schema('private');
select has_schema('audit');
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon has no usage on private');
select ok(not has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated has no usage on private');
select ok(not has_schema_privilege('authenticated', 'audit', 'USAGE'), 'authenticated has no usage on audit');

-- platform_admins: RLS on, no client grants.
select ok((select relrowsecurity from pg_class where oid = 'public.platform_admins'::regclass), 'platform_admins has RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.platform_admins', 'SELECT'), 'authenticated cannot select platform_admins');
select ok(not has_table_privilege('anon', 'public.platform_admins', 'SELECT'), 'anon cannot select platform_admins');

-- get_my_platform_role: authenticated only.
select ok(has_function_privilege('authenticated', 'public.get_my_platform_role()', 'EXECUTE'), 'authenticated can call get_my_platform_role');
select ok(not has_function_privilege('anon', 'public.get_my_platform_role()', 'EXECUTE'), 'anon cannot call get_my_platform_role');
select ok(not has_function_privilege('authenticated', 'private.is_platform_admin(text[])', 'EXECUTE'), 'private helpers are not callable by clients');

-- Fixtures: one operator, one ordinary user.
insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000000a1', 'operator@test.local', 'authenticated', 'authenticated'),
       ('00000000-0000-0000-0000-0000000000b1', 'shopkeeper@test.local', 'authenticated', 'authenticated');
insert into public.platform_admins (user_id, role) values ('00000000-0000-0000-0000-0000000000a1', 'support_agent');

set local role authenticated;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated","aal":"aal1"}';
select is(public.get_my_platform_role(), null, 'ordinary user has no platform role');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}';
select is(public.get_my_platform_role(), 'support_agent', 'operator sees only their own role');

select throws_ok(
  $$ select * from public.platform_admins $$,
  '42501',
  null,
  'operator cannot read platform_admins directly'
);

reset role;

-- is_platform_admin requires aal2 (checked as the owner, since clients cannot call it).
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}';
select ok(not private.is_platform_admin(array['support_agent']), 'operator without MFA is not treated as admin');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';
select ok(private.is_platform_admin(array['support_agent']), 'operator with MFA and matching role is admin');

-- Audit log is append-only even for the table owner.
select private.write_audit('system', 'test.baseline_checked');
select throws_ok($$ update audit.events set reason = 'x' $$, '42501', 'audit.events is append-only', 'audit events cannot be updated');

select * from finish();
rollback;
