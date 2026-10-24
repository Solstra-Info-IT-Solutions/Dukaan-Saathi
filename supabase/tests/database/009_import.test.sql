-- Phase 03 CSV import: staging, validation codes, fixing/skipping rows, atomic idempotent commit, limits.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;

insert into auth.users (id, phone, phone_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000d0a1', '919400000001', now(), 'authenticated', 'authenticated');
select pg_temp.login('00000000-0000-0000-0000-00000000d0a1');
insert into ctx select 'shop', public.create_shop('{"clientOperationId":"88888888-8888-7888-8888-888888888881","name":"Import Shop","businessCategory":"kirana"}') ->> 'shopId';
select public.save_product((select v::uuid from ctx where k = 'shop'),
  '{"id":"0190f0f0-0000-7000-8000-00000000b001","name":"Tata Salt","pricePaise":2500,"barcodes":["8904043901015"]}');

insert into ctx select 'job', public.create_import_job((select v::uuid from ctx where k = 'shop'), 'products.csv',
  '99999999-9999-7999-8999-999999999991') ->> 'jobId';

-- 1 idempotent job creation
select is(public.create_import_job((select v::uuid from ctx where k = 'shop'), 'products.csv', '99999999-9999-7999-8999-999999999991') ->> 'jobId',
          (select v from ctx where k = 'job'), 'creating a job twice with one operation id returns the same job');

-- 2..9 staging and validation
insert into ctx select 'summary', public.stage_import_rows((select v::uuid from ctx where k = 'job'), '[
  {"rowNumber": 2, "name": "Aashirvaad Atta 5kg", "nameHi": "आटा", "category": "Grocery", "unit": "pcs", "price": "₹1,250.50", "barcode": "8901725181222"},
  {"rowNumber": 3, "name": "Pyaaz", "category": "Sabzi", "unit": "kilo", "price": "40", "taxRate": "5%"},
  {"rowNumber": 4, "name": "Tata Salt", "price": "Rs 28"},
  {"rowNumber": 5, "name": "", "price": "10"},
  {"rowNumber": 6, "name": "Broken Price", "price": "abc"},
  {"rowNumber": 7, "name": "Weird Unit", "price": "5", "unit": "bori"},
  {"rowNumber": 8, "name": "pyaaz", "price": "42", "unit": "kg"}
]'::jsonb)::text;

select is(((select v from ctx where k = 'summary')::jsonb ->> 'rowCount')::int, 7, 'all rows are staged');
select is((select normalized ->> 'pricePaise' from public.import_job_rows where job_id = (select v::uuid from ctx where k = 'job') and row_number = 2),
          '125050', 'rupee text is parsed into paise exactly');
select is((select normalized ->> 'unitCode' from public.import_job_rows where job_id = (select v::uuid from ctx where k = 'job') and row_number = 3),
          'kg', 'unit synonyms are mapped');
select is((select normalized ->> 'taxRateCode' from public.import_job_rows where job_id = (select v::uuid from ctx where k = 'job') and row_number = 3),
          'GST_5', 'tax rates are mapped from percentages');
select is((select action from public.import_job_rows where job_id = (select v::uuid from ctx where k = 'job') and row_number = 4),
          'update', 'an existing product is matched by name');
select is((select errors from public.import_job_rows where job_id = (select v::uuid from ctx where k = 'job') and row_number = 5),
          array['REQUIRED_NAME'], 'missing names are reported');
select is((select errors from public.import_job_rows where job_id = (select v::uuid from ctx where k = 'job') and row_number = 7),
          array['UNKNOWN_UNIT'], 'unknown units are reported');
select is((select errors from public.import_job_rows where job_id = (select v::uuid from ctx where k = 'job') and row_number = 8),
          array['DUPLICATE_IN_FILE'], 'duplicate names in one file are reported');

-- 10 commit refuses while errors remain
select throws_ok($$ select public.commit_product_import((select v::uuid from ctx where k = 'job'), '99999999-9999-7999-8999-999999999992') $$,
                 'P0001', 'DS_VALIDATION_FAILED', 'commit is refused while rows have errors');

-- 11..12 fix and skip
select is((public.update_import_row((select id from public.import_job_rows where job_id = (select v::uuid from ctx where k = 'job') and row_number = 6),
           '{"price": "15.5"}') ->> 'errorCount')::int, 3, 'fixing a row revalidates the job');
select public.update_import_row(id, '{}', true) from public.import_job_rows
 where job_id = (select v::uuid from ctx where k = 'job') and row_number in (5, 7, 8);
select is((select error_count from public.import_jobs where id = (select v::uuid from ctx where k = 'job')), 0,
          'skipped rows no longer block the commit');

-- 13..15 commit
select is(public.commit_product_import((select v::uuid from ctx where k = 'job'), '99999999-9999-7999-8999-999999999993') ->> 'created',
          '3', 'valid new rows create products');
select is((select price_paise from public.products where id = '0190f0f0-0000-7000-8000-00000000b001'), 2800::bigint,
          'matched rows update the existing product');
select is((public.commit_product_import((select v::uuid from ctx where k = 'job'), '99999999-9999-7999-8999-999999999993') ->> 'replayed')::boolean,
          true, 're-committing with the same operation id is a no-op replay');

-- 16 row limit
reset role;
insert into public.shop_entitlement_overrides (shop_id, entitlement_key, value, reason)
values ((select v::uuid from ctx where k = 'shop'), 'import.rows_per_job', '1', 'test: one row');
select pg_temp.login('00000000-0000-0000-0000-00000000d0a1');
insert into ctx select 'job2', public.create_import_job((select v::uuid from ctx where k = 'shop'), 'big.csv',
  '99999999-9999-7999-8999-999999999994') ->> 'jobId';
select throws_ok($$ select public.stage_import_rows((select v::uuid from ctx where k = 'job2'),
                    '[{"rowNumber":2,"name":"A","price":"1"},{"rowNumber":3,"name":"B","price":"2"}]') $$,
                 'P0001', 'DS_QUOTA_EXCEEDED', 'rows per import are limited by the plan');

reset role;
select * from finish();
rollback;
