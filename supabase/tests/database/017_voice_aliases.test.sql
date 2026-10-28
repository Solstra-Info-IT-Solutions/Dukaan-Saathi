-- Phase 10: add_product_alias (voice billing learns what the shopkeeper says for an item).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;
create function pg_temp.ctx(p_k text) returns text language sql as $$ select v from ctx where k = p_k $$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users (id, phone, phone_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000b0a1', '919400000201', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b0c1', '919400000203', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b0b1', '919400000202', now(), 'authenticated', 'authenticated');
insert into ctx values ('sugar', '0190f0f0-0000-7000-8000-00000000b0e1');

select pg_temp.login('00000000-0000-0000-0000-00000000b0a1');
insert into ctx select 'shopA', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-88888888b0a1","name":"Voice Shop","businessCategory":"kirana"}') ->> 'shopId';
insert into ctx select 'invC', public.invite_shop_member(pg_temp.ctx('shopA')::uuid, 'cashier', '+919400000203') ->> 'invitationId';
select public.save_product(pg_temp.ctx('shopA')::uuid, jsonb_build_object('id', pg_temp.ctx('sugar'), 'name', 'Sugar',
  'nameHi', 'चीनी', 'unitCode', 'kg', 'pricePaise', 4400, 'barcodes', '[]'::jsonb, 'aliases', '[]'::jsonb));
select pg_temp.login('00000000-0000-0000-0000-00000000b0c1');
select public.accept_shop_invitation(pg_temp.ctx('invC')::uuid);
select pg_temp.login('00000000-0000-0000-0000-00000000b0b1');
insert into ctx select 'shopB', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-88888888b0b1","name":"Other Shop","businessCategory":"kirana"}') ->> 'shopId';

select pg_temp.login('00000000-0000-0000-0000-00000000b0a1');
select is(public.add_product_alias(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('sugar')::uuid, '  Shakkar ') -> 'aliases',
          '["shakkar"]'::jsonb, 'the owner teaches "shakkar" for sugar (trimmed, lower case)');
select is((select source from public.product_aliases where alias = 'shakkar'), 'voice_learned', 'marked as learned by voice');
select is(public.add_product_alias(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('sugar')::uuid, 'SHAKKAR') ->> 'added', 'false',
          'the same alias again adds nothing');
select is(public.add_product_alias(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('sugar')::uuid, 'sugar') ->> 'added', 'false',
          'the item''s own name is not stored as an alias');
reset role; -- search_text is not readable by clients
select ok((select search_text like '%shakkar%' from public.products where id = pg_temp.ctx('sugar')::uuid),
          'search finds the item by the new alias');
select pg_temp.login('00000000-0000-0000-0000-00000000b0a1');
select throws_ok($$ select public.add_product_alias(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('sugar')::uuid, 'x') $$,
  'P0001', 'DS_VALIDATION_FAILED', 'a one-letter alias is refused');
select pg_temp.login('00000000-0000-0000-0000-00000000b0c1');
select throws_ok($$ select public.add_product_alias(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('sugar')::uuid, 'cheeni sugar') $$,
  'P0001', 'DS_PERMISSION_DENIED', 'a cashier cannot change the catalogue');
select pg_temp.login('00000000-0000-0000-0000-00000000b0b1');
select throws_ok($$ select public.add_product_alias(pg_temp.ctx('shopA')::uuid, pg_temp.ctx('sugar')::uuid, 'meetha') $$,
  'P0001', 'DS_NOT_A_MEMBER', 'another shop cannot add aliases');

select * from finish();
rollback;
