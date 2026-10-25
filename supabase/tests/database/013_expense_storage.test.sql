-- requires: storage
-- Expense receipt photos: private bucket; members with expense.create upload under their own shop only.
-- Needs Supabase's storage schema, so it runs in CI (`supabase test db`) and is skipped by the PGlite pre-check.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;

insert into auth.users (id, phone, phone_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000007a1', '919400000071', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000007b1', '919400000072', now(), 'authenticated', 'authenticated');
select pg_temp.login('00000000-0000-0000-0000-0000000007a1');
insert into ctx select 'shopA', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-8888888887a1","name":"Storage Shop A","businessCategory":"kirana"}') ->> 'shopId';
select pg_temp.login('00000000-0000-0000-0000-0000000007b1');
insert into ctx select 'shopB', public.create_shop('{"clientOperationId":"88888888-8888-4888-8888-8888888887b1","name":"Storage Shop B","businessCategory":"kirana"}') ->> 'shopId';

reset role;
select is((select public from storage.buckets where id = 'expense-attachments'), false, 'the attachment bucket is private');

select pg_temp.login('00000000-0000-0000-0000-0000000007a1');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner)
                   values ('expense-attachments', (select v from ctx where k = 'shopA') || '/0190f0f0-0000-7000-8000-000000070001/receipt.jpg',
                           '00000000-0000-0000-0000-0000000007a1') $$,
                'an owner uploads a receipt under their shop');
select pg_temp.login('00000000-0000-0000-0000-0000000007b1');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner)
                    values ('expense-attachments', (select v from ctx where k = 'shopA') || '/0190f0f0-0000-7000-8000-000000070002/receipt.jpg',
                            '00000000-0000-0000-0000-0000000007b1') $$,
                 '42501', null, 'another shop cannot upload into shop A');
select is((select count(*) from storage.objects where bucket_id = 'expense-attachments')::int, 0,
          'another shop cannot see shop A receipts');

select * from finish();
rollback;
