-- list_shop_members: names for all members, contacts only for staff managers.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;

insert into auth.users (id, phone, phone_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000a0a1', '919200000001', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a0c1', '919200000003', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a0e1', '919200000005', now(), 'authenticated', 'authenticated');

select pg_temp.login('00000000-0000-0000-0000-00000000a0a1');
insert into ctx select 'shop', public.create_shop(
  '{"clientOperationId":"66666666-6666-7666-8666-666666666666","name":"Listing Shop","businessCategory":"kirana"}') ->> 'shopId';
insert into ctx select 'inv', public.invite_shop_member((select v::uuid from ctx where k = 'shop'), 'cashier', '+919200000003') ->> 'invitationId';

select pg_temp.login('00000000-0000-0000-0000-00000000a0c1');
select public.accept_shop_invitation((select v::uuid from ctx where k = 'inv'));

-- Cashier view
select is(jsonb_array_length(public.list_shop_members((select v::uuid from ctx where k = 'shop'))), 2,
          'cashier sees both active members');
select is(public.list_shop_members((select v::uuid from ctx where k = 'shop')) -> 0 ->> 'phone', null,
          'cashier does not see the owner''s phone');
select is(public.list_shop_members((select v::uuid from ctx where k = 'shop')) -> 1 ->> 'phone', '+919200000003',
          'cashier sees their own phone');

-- Owner view
select pg_temp.login('00000000-0000-0000-0000-00000000a0a1');
select is(public.list_shop_members((select v::uuid from ctx where k = 'shop')) -> 1 ->> 'phone', '+919200000003',
          'owner sees staff phone numbers');
select is(public.list_shop_members((select v::uuid from ctx where k = 'shop')) -> 0 ->> 'role', 'owner',
          'owners are listed first');

-- Outsider
select pg_temp.login('00000000-0000-0000-0000-00000000a0e1');
select throws_ok($$ select public.list_shop_members((select v::uuid from ctx where k = 'shop')) $$,
                 'P0001', 'DS_NOT_A_MEMBER', 'non-members cannot list members');

reset role;
select * from finish();
rollback;
