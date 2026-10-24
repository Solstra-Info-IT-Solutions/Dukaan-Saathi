-- Catalogue checks that every future migration must keep passing (SECURITY_MODEL.md §5, S-07).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- 1. Every security definer function in our schemas pins search_path.
select is_empty(
  $$
    select n.nspname || '.' || p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private', 'audit')
       and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  $$,
  'all security definer functions set search_path'
);

-- 2. No function in public is executable by anon.
select is_empty(
  $$
    select n.nspname || '.' || p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  $$,
  'anon cannot execute any public function'
);

-- 3. No private/audit function is executable by client roles.
select is_empty(
  $$
    select n.nspname || '.' || p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('private', 'audit')
       and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  $$,
  'private and audit functions are not executable by clients'
);

-- 4. Every table in public has RLS enabled.
select is_empty(
  $$
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  $$,
  'every public table has row level security enabled'
);

select * from finish();
rollback;
