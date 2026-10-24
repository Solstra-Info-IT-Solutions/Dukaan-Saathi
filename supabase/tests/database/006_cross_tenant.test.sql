-- S-01: generic cross-tenant check over EVERY public table with a shop_id column.
-- New tables are covered automatically. A table without a client grant counts as isolated.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Tables (with a shop_id column) in which the caller can see rows of p_shop.
create function pg_temp.visible_tables(p_shop uuid) returns text[] language plpgsql as $$
declare
  t text;
  n bigint;
  found_in text[] := '{}';
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'shop_id' and not a.attisdropped
     where ns.nspname = 'public' and c.relkind = 'r'
     order by c.relname
  loop
    begin
      execute format('select count(*) from public.%I where shop_id = $1', t) into n using p_shop;
      if n > 0 then
        found_in := found_in || t;
      end if;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  return found_in;
end;
$$;

create temp table ctx (k text primary key, v text);
grant all on ctx to public;

insert into auth.users (id, phone, phone_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000000e1', '919100000001', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f1', '919100000002', now(), 'authenticated', 'authenticated');

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
insert into ctx select 'shopA', public.create_shop(
  '{"clientOperationId":"44444444-4444-7444-8444-444444444444","name":"Tenant A","businessCategory":"kirana"}') ->> 'shopId';
select public.register_device((select v::uuid from ctx where k = 'shopA'), 'bbbbbbbb-0000-4000-8000-000000000001', 'android');
select public.invite_shop_member((select v::uuid from ctx where k = 'shopA'), 'cashier', '+919100000009');

-- Sanity: the owner does see their own rows, so the probe itself works.
select ok(cardinality(pg_temp.visible_tables((select v::uuid from ctx where k = 'shopA'))) >= 4,
          'owner sees their own shop rows in several tables');

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select public.create_shop('{"clientOperationId":"55555555-5555-7555-8555-555555555555","name":"Tenant B","businessCategory":"general"}');

select is(pg_temp.visible_tables((select v::uuid from ctx where k = 'shopA')), '{}'::text[],
          'another tenant sees no rows of shop A in any table');
select is((select count(*) from public.shops where id = (select v::uuid from ctx where k = 'shopA'))::int, 0,
          'another tenant cannot see shop A itself');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000e1')::int, 0,
          'another user cannot read shop A owner''s profile');

reset role;
select * from finish();
rollback;
