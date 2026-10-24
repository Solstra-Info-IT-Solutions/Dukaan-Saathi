// Local pre-check for machines without Docker (DECISIONS.md OD-13).
// Runs supabase/migrations/*.sql and supabase/tests/database/*.test.sql inside PGlite (Postgres in WASM)
// with stubs for Supabase's auth schema and roles plus a minimal pgTAP shim.
//
// This is NOT a substitute for `supabase test db`: real Supabase auth, storage and the real pgTAP
// extension only exist in the Supabase stack, which CI runs. Use this to catch SQL errors early.
//
// Usage: node scripts/db-check-pglite.mjs
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant anon, authenticated, service_role to postgres;
create schema auth;
create schema extensions;
create table auth.users (id uuid primary key, email text, phone text, email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz, aud text, role text);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
`;

// Minimal pgTAP in its own schema (like the real extension living in `extensions`), recording into tap.results.
const PGTAP_SHIM = `
create schema tap;
grant usage on schema tap to public;
create table tap.results (n serial, ok boolean, description text, detail text);
grant all on tap.results to public;
grant usage on sequence tap.results_n_seq to public;
create function tap.plan(int) returns text language sql as $$ select 'plan ' || $1 $$;
create function tap.finish() returns setof text language sql as $$ select 'done'::text $$;
create function tap._record(p_ok boolean, p_desc text, p_detail text default null) returns text
  language sql security definer as $$ insert into tap.results (ok, description, detail) values (coalesce(p_ok, false), p_desc, p_detail); select p_desc $$;
create function tap.ok(boolean, text default null) returns text language sql as $$ select tap._record($1, $2) $$;
create function tap.is(anyelement, anyelement, text default null) returns text language sql as $$
  select tap._record($1 is not distinct from $2, $3, format('got %s, expected %s', $1, $2)) $$;
create function tap.is(text, text, text default null) returns text language sql as $$
  select tap._record($1 is not distinct from $2, $3, format('got %s, expected %s', $1, $2)) $$;
create function tap.has_schema(text) returns text language sql as $$
  select tap._record(exists (select 1 from pg_namespace where nspname = $1), 'schema ' || $1 || ' exists') $$;
create function tap.is_empty(text, text default null) returns text language plpgsql as $$
declare v_count int; begin execute format('select count(*) from (%s) q', $1) into v_count;
  return tap._record(v_count = 0, $2, v_count || ' rows'); end $$;
create function tap.throws_ok(text, text, text, text default null) returns text language plpgsql as $$
begin
  begin execute $1;
  exception when others then
    return tap._record(sqlstate = $2 and ($3 is null or sqlerrm = $3), $4, sqlstate || ': ' || sqlerrm);
  end;
  return tap._record(false, $4, 'no exception raised');
end $$;
create function tap.results_eq(text, text, text default null) returns text language plpgsql as $$
declare v_diff int; begin
  execute format('select count(*) from ((select * from (%1$s) a except all select * from (%2$s) b) union all (select * from (%2$s) c except all select * from (%1$s) d)) x', $1, $2) into v_diff;
  return tap._record(v_diff = 0, $3, v_diff || ' differing rows'); end $$;
grant execute on all functions in schema tap to public;
alter role postgres set search_path = public, tap, extensions;
`;

function sqlFiles(dir, suffix) {
  return readdirSync(join(root, dir))
    .filter((f) => f.endsWith(suffix))
    .sort()
    .map((f) => ({ name: `${dir}/${f}`, sql: readFileSync(join(root, dir, f), 'utf8') }));
}

const db = await PGlite.create({ extensions: { pg_trgm } });
await db.exec(SUPABASE_STUBS);

for (const m of sqlFiles('supabase/migrations', '.sql')) {
  try {
    await db.exec(m.sql);
    console.log(`migration ok   ${m.name}`);
  } catch (error) {
    console.error(`migration FAIL ${m.name}: ${error.message}`);
    process.exit(1);
  }
}

await db.exec(PGTAP_SHIM);
await db.exec('set search_path = public, tap, extensions');

let failed = 0;
let total = 0;
for (const t of sqlFiles('supabase/tests/database', '.test.sql')) {
  // The shim replaces the pgtap extension; results must survive the test's final rollback.
  const sql = t.sql
    .replace(/create extension if not exists pgtap[^;]*;/i, '')
    .replace(/^\s*rollback;\s*$/m, 'commit;');
  await db.exec('truncate tap.results');
  try {
    await db.exec(sql);
  } catch (error) {
    console.error(`test FAIL      ${t.name}: ${error.message}`);
    failed += 1;
    await db.exec('rollback').catch(() => {});
    continue;
  }
  const { rows } = await db.query('select ok, description, detail from tap.results order by n');
  const bad = rows.filter((r) => !r.ok);
  total += rows.length;
  failed += bad.length;
  console.log(
    `test ${bad.length ? 'FAIL' : 'ok  '}      ${t.name} (${rows.length - bad.length}/${rows.length})`,
  );
  for (const r of bad) console.log(`   not ok: ${r.description} — ${r.detail}`);
  // Reset fixtures inserted by the test (it committed instead of rolling back).
  await db.exec('truncate auth.users cascade; truncate audit.events; truncate private.idempotency_keys;');
  // Each real pgTAP file runs in its own rolled-back transaction; emulate by dropping its temp objects.
  await db.exec(`do $$ declare f regprocedure; begin
    for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = pg_my_temp_schema() loop
      execute 'drop function ' || f; end loop; end $$; discard temp;`);
}

console.log(`\n${total - failed}/${total} assertions passed`);
process.exit(failed ? 1 : 0);
