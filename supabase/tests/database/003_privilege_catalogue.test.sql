-- Catalogue checks that every future migration must keep passing (SECURITY_MODEL.md §5, S-07).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- 1. Every security definer function in our schemas pins search_path.
select is_empty(
  $$
    select n.nspname || '.' || p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private', 'audit', 'rls')
       and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  $$,
  'all security definer functions set search_path'
);

-- 2. Only the explicit allow-list of public functions is executable by anon.
select is_empty(
  $$
    select n.nspname || '.' || p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and p.proname not in ('get_client_config')
  $$,
  'anon can execute only allow-listed public functions'
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

-- 4. RLS helper functions: authenticated only, never anon.
select is_empty(
  $$
    select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'rls' and has_function_privilege('anon', p.oid, 'EXECUTE')
  $$,
  'rls helpers are not executable by anon'
);

-- 5. Every table in public has RLS enabled.
select is_empty(
  $$
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  $$,
  'every public table has row level security enabled'
);

-- 6. anon has no privileges on any public table.
select is_empty(
  $$
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
            or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'))
  $$,
  'anon has no table privileges in public'
);

select * from finish();
rollback;
