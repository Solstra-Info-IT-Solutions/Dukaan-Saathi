-- Phase 03: units, tax rates, categories, products, barcodes, aliases, price history, search,
-- and CSV import staging/commit. Spec: docs/features/catalogue-and-imports.md.
-- Writes go through RPCs (multi-table, quota-checked, audited); clients read via RLS.

create extension if not exists pg_trgm with schema extensions;

-- ===========================================================================
-- 1. Platform reference data (read-only for clients)
-- ===========================================================================
create table public.units (
  code text primary key check (code ~ '^[a-z]{1,8}$'),
  label jsonb not null,
  allows_fraction boolean not null,
  sort_order integer not null default 0
);

create table public.tax_rates (
  code text primary key check (code ~ '^[A-Z0-9_]{2,16}$'),
  rate_bp integer not null check (rate_bp between 0 and 10000),
  label text not null,
  effective_from date not null,
  effective_to date,
  check (effective_to is null or effective_to > effective_from)
);

-- Words people type in spreadsheets for a unit ("kilo", "किलो", "pcs") → unit code.
create table private.unit_synonyms (
  synonym text primary key,
  unit_code text not null references public.units (code)
);

insert into public.units (code, label, allows_fraction, sort_order) values
  ('pc', '{"en":"Piece","hi":"नग"}', false, 1),
  ('kg', '{"en":"Kilogram","hi":"किलो"}', true, 2),
  ('g', '{"en":"Gram","hi":"ग्राम"}', true, 3),
  ('l', '{"en":"Litre","hi":"लीटर"}', true, 4),
  ('ml', '{"en":"Millilitre","hi":"मिलीलीटर"}', true, 5),
  ('dozen', '{"en":"Dozen","hi":"दर्जन"}', true, 6),
  ('pkt', '{"en":"Packet","hi":"पैकेट"}', false, 7),
  ('box', '{"en":"Box","hi":"डिब्बा"}', false, 8),
  ('m', '{"en":"Metre","hi":"मीटर"}', true, 9);

insert into private.unit_synonyms (synonym, unit_code) values
  ('pc', 'pc'), ('pcs', 'pc'), ('piece', 'pc'), ('pieces', 'pc'), ('nos', 'pc'), ('no', 'pc'), ('unit', 'pc'), ('नग', 'pc'), ('पीस', 'pc'),
  ('kg', 'kg'), ('kgs', 'kg'), ('kilo', 'kg'), ('kilogram', 'kg'), ('किलो', 'kg'), ('किग्रा', 'kg'),
  ('g', 'g'), ('gm', 'g'), ('gms', 'g'), ('gram', 'g'), ('grams', 'g'), ('ग्राम', 'g'),
  ('l', 'l'), ('ltr', 'l'), ('litre', 'l'), ('liter', 'l'), ('लीटर', 'l'),
  ('ml', 'ml'), ('millilitre', 'ml'), ('milliliter', 'ml'),
  ('dozen', 'dozen'), ('dz', 'dozen'), ('दर्जन', 'dozen'),
  ('pkt', 'pkt'), ('packet', 'pkt'), ('pack', 'pkt'), ('पैकेट', 'pkt'),
  ('box', 'box'), ('डिब्बा', 'box'),
  ('m', 'm'), ('mtr', 'm'), ('metre', 'm'), ('meter', 'm'), ('मीटर', 'm');

-- GST slabs after the September 2025 rationalisation. Platform-managed; rates are snapshotted on sale lines.
insert into public.tax_rates (code, rate_bp, label, effective_from) values
  ('GST_0', 0, 'GST 0%', '2017-07-01'),
  ('GST_5', 500, 'GST 5%', '2017-07-01'),
  ('GST_18', 1800, 'GST 18%', '2017-07-01'),
  ('GST_40', 4000, 'GST 40%', '2025-09-22');

-- ===========================================================================
-- 2. Shop catalogue
-- ===========================================================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  name_hi text check (name_hi is null or char_length(name_hi) <= 80),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id)
);
create unique index categories_unique_name on public.categories (shop_id, lower(name)) where archived_at is null;
create trigger categories_updated_at before update on public.categories
  for each row execute function private.set_updated_at();

create table public.products (
  id uuid primary key,                         -- client-generated (UUID v7) so a save is idempotent
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  name_hi text check (name_hi is null or char_length(name_hi) <= 120),
  category_id uuid,
  unit_code text not null default 'pc' references public.units (code),
  price_paise bigint not null check (price_paise between 0 and 100000000),
  mrp_paise bigint check (mrp_paise is null or mrp_paise between 0 and 100000000),
  last_cost_paise bigint check (last_cost_paise is null or last_cost_paise >= 0),
  tax_rate_code text references public.tax_rates (code),
  hsn_code text check (hsn_code is null or hsn_code ~ '^[0-9]{4,8}$'),
  track_stock boolean not null default false,
  stock_on_hand_milli bigint not null default 0,
  low_stock_threshold_milli bigint check (low_stock_threshold_milli is null or low_stock_threshold_milli >= 0),
  search_text text not null default '',
  is_active boolean not null default true,
  archived_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id),
  foreign key (shop_id, category_id) references public.categories (shop_id, id)
);
create index products_shop_name on public.products (shop_id, lower(name), id) where archived_at is null;
create index products_category on public.products (shop_id, category_id) where archived_at is null;
create index products_search_trgm on public.products using gin (search_text extensions.gin_trgm_ops);
create index products_created_by on public.products (created_by);
create index products_unit on public.products (unit_code);
create index products_tax_rate on public.products (tax_rate_code);
create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();

create table public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  product_id uuid not null,
  barcode text not null check (barcode ~ '^[A-Za-z0-9\-\.]{3,64}$'),
  created_at timestamptz not null default now(),
  foreign key (shop_id, product_id) references public.products (shop_id, id) on delete cascade,
  unique (shop_id, barcode)
);
create index product_barcodes_product on public.product_barcodes (shop_id, product_id);

create table public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  product_id uuid not null,
  alias text not null check (char_length(btrim(alias)) between 1 and 60),
  source text not null default 'owner' check (source in ('owner', 'import', 'voice_learned')),
  created_at timestamptz not null default now(),
  foreign key (shop_id, product_id) references public.products (shop_id, id) on delete cascade
);
create unique index product_aliases_unique on public.product_aliases (product_id, lower(alias));

create table public.product_price_history (
  id bigint generated always as identity primary key,
  shop_id uuid not null,
  product_id uuid not null,
  price_paise bigint not null,
  effective_from timestamptz not null default now(),
  changed_by uuid references auth.users (id),
  foreign key (shop_id, product_id) references public.products (shop_id, id) on delete cascade
);
create index product_price_history_product on public.product_price_history (shop_id, product_id, effective_from desc);
create index product_price_history_changed_by on public.product_price_history (changed_by);

-- ===========================================================================
-- 3. Triggers: quota, price history, search text
-- ===========================================================================

-- products.max counts non-archived products. Checked for every insert, including imports.
create or replace function private.enforce_product_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_quota(new.shop_id, 'products.max',
    (select count(*) from public.products p where p.shop_id = new.shop_id and p.archived_at is null));
  return new;
end;
$$;
create trigger products_quota before insert on public.products
  for each row execute function private.enforce_product_quota();

create or replace function private.record_price_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.price_paise is distinct from old.price_paise then
    insert into public.product_price_history (shop_id, product_id, price_paise, changed_by)
    values (new.shop_id, new.id, new.price_paise, auth.uid());
  end if;
  return null;
end;
$$;
create trigger products_price_history after insert or update of price_paise on public.products
  for each row execute function private.record_price_history();

-- Name + Hindi name + aliases, lower-cased, for trigram search.
create or replace function private.refresh_product_search_text(p_product_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.products p
     set search_text = lower(concat_ws(' ', p.name, p.name_hi,
           (select string_agg(a.alias, ' ') from public.product_aliases a where a.product_id = p.id)))
   where p.id = p_product_id;
$$;

create or replace function private.products_search_text_trigger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text := lower(concat_ws(' ', new.name, new.name_hi,
    (select string_agg(a.alias, ' ') from public.product_aliases a where a.product_id = new.id)));
  return new;
end;
$$;
create trigger products_search_text before insert or update of name, name_hi on public.products
  for each row execute function private.products_search_text_trigger();

-- ===========================================================================
-- 4. RLS (reads only; writes through RPCs)
-- ===========================================================================
alter table public.units enable row level security;
alter table public.tax_rates enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_barcodes enable row level security;
alter table public.product_aliases enable row level security;
alter table public.product_price_history enable row level security;

revoke all on public.units, public.tax_rates, public.categories, public.products, public.product_barcodes,
  public.product_aliases, public.product_price_history from anon, authenticated;
revoke all on private.unit_synonyms from public, anon, authenticated;

create policy units_read on public.units for select to authenticated using (true);
create policy tax_rates_read on public.tax_rates for select to authenticated using (true);
create policy categories_select_member on public.categories for select to authenticated
  using ((select rls.is_member(shop_id)));
create policy products_select_member on public.products for select to authenticated
  using ((select rls.is_member(shop_id)));
create policy product_barcodes_select_member on public.product_barcodes for select to authenticated
  using ((select rls.is_member(shop_id)));
create policy product_aliases_select_member on public.product_aliases for select to authenticated
  using ((select rls.is_member(shop_id)));
create policy product_price_history_select_member on public.product_price_history for select to authenticated
  using ((select rls.has_permission(shop_id, 'product.manage')));

grant select on public.units, public.tax_rates, public.categories, public.product_barcodes,
  public.product_aliases, public.product_price_history to authenticated;
-- Cost price is visible only through search_products (masked without product.view_cost).
grant select (id, shop_id, name, name_hi, category_id, unit_code, price_paise, mrp_paise, tax_rate_code, hsn_code,
              track_stock, stock_on_hand_milli, low_stock_threshold_milli, is_active, archived_at, created_at, updated_at)
  on public.products to authenticated;

-- ===========================================================================
-- 5. JSON shape and catalogue RPCs
-- ===========================================================================
create or replace function private.product_json(p public.products, p_show_cost boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'nameHi', p.name_hi,
    'categoryId', p.category_id,
    'unitCode', p.unit_code,
    'pricePaise', p.price_paise,
    'mrpPaise', p.mrp_paise,
    'lastCostPaise', case when p_show_cost then p.last_cost_paise end,
    'taxRateCode', p.tax_rate_code,
    'hsnCode', p.hsn_code,
    'trackStock', p.track_stock,
    'stockOnHandMilli', p.stock_on_hand_milli,
    'lowStockThresholdMilli', p.low_stock_threshold_milli,
    'isActive', p.is_active,
    'barcodes', coalesce((select jsonb_agg(b.barcode order by b.created_at) from public.product_barcodes b
                           where b.shop_id = p.shop_id and b.product_id = p.id), '[]'::jsonb),
    'aliases', coalesce((select jsonb_agg(a.alias order by a.created_at) from public.product_aliases a
                          where a.shop_id = p.shop_id and a.product_id = p.id), '[]'::jsonb),
    'updatedAt', p.updated_at
  );
$$;

create or replace function public.get_catalogue_reference(p_shop_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_member(p_shop_id);
  return jsonb_build_object(
    'units', (select jsonb_agg(jsonb_build_object('code', u.code, 'label', u.label, 'allowsFraction', u.allows_fraction)
                               order by u.sort_order) from public.units u),
    'taxRates', (select jsonb_agg(jsonb_build_object('code', t.code, 'rateBp', t.rate_bp, 'label', t.label) order by t.rate_bp)
                   from public.tax_rates t
                  where t.effective_from <= current_date and (t.effective_to is null or t.effective_to > current_date)),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'nameHi', c.name_hi)
                                             order by c.sort_order, lower(c.name))
                              from public.categories c where c.shop_id = p_shop_id and c.archived_at is null), '[]'::jsonb)
  );
end;
$$;

-- Creates or renames a category. p_id null = create.
create or replace function public.save_category(p_shop_id uuid, p_id uuid, p_name text, p_name_hi text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_member(p_shop_id, 'product.manage');
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"name"}');
  end if;
  begin
    if p_id is null then
      insert into public.categories (shop_id, name, name_hi, created_by)
      values (p_shop_id, btrim(p_name), nullif(btrim(p_name_hi), ''), auth.uid())
      returning id into v_id;
    else
      update public.categories set name = btrim(p_name), name_hi = nullif(btrim(p_name_hi), '')
       where shop_id = p_shop_id and id = p_id and archived_at is null
      returning id into v_id;
      if v_id is null then
        perform private.raise_ds('DS_NOT_FOUND');
      end if;
    end if;
  exception when unique_violation then
    perform private.raise_ds('DS_CONFLICT', '{"field":"name","reason":"category_exists"}');
  end;
  return jsonb_build_object('id', v_id);
end;
$$;

-- Archives a category; its products keep working and become uncategorised.
create or replace function public.archive_category(p_shop_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_member(p_shop_id, 'product.manage');
  update public.products set category_id = null where shop_id = p_shop_id and category_id = p_id;
  update public.categories set archived_at = now() where shop_id = p_shop_id and id = p_id and archived_at is null;
  if not found then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
end;
$$;

-- Creates or updates a product with its barcodes and aliases in one transaction.
-- The client generates the product id, so retrying a create is safe.
create or replace function public.save_product(p_shop_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_existing public.products;
  v_barcodes text[];
  v_aliases text[];
  v_price bigint;
  v_mrp bigint;
  v_product public.products;
begin
  perform private.require_member(p_shop_id, 'product.manage');
  if jsonb_typeof(p_input) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_input) k where k not in
       ('id', 'name', 'nameHi', 'categoryId', 'unitCode', 'pricePaise', 'mrpPaise', 'taxRateCode', 'hsnCode',
        'trackStock', 'lowStockThresholdMilli', 'isActive', 'barcodes', 'aliases')) then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"unknown_fields"}');
  end if;
  begin
    v_id := (p_input ->> 'id')::uuid;
    v_price := (p_input ->> 'pricePaise')::bigint;
    v_mrp := (p_input ->> 'mrpPaise')::bigint;
  exception when others then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_number_or_id"}');
  end;
  if v_id is null or v_price is null then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"id_and_price_required"}');
  end if;
  if char_length(btrim(coalesce(p_input ->> 'name', ''))) not between 1 and 120 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"name"}');
  end if;

  v_barcodes := coalesce(array(select distinct btrim(x) from jsonb_array_elements_text(coalesce(p_input -> 'barcodes', '[]')) x
                               where btrim(x) <> ''), '{}');
  v_aliases := coalesce(array(select distinct btrim(x) from jsonb_array_elements_text(coalesce(p_input -> 'aliases', '[]')) x
                              where btrim(x) <> ''), '{}');
  if cardinality(v_barcodes) > 10 or cardinality(v_aliases) > 20 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"too_many_barcodes_or_aliases"}');
  end if;

  select * into v_existing from public.products where id = v_id for update;
  if v_existing.id is not null and v_existing.shop_id <> p_shop_id then
    perform private.raise_ds('DS_CONFLICT', '{"reason":"id_in_use"}');
  end if;

  begin
    if v_existing.id is null then
      insert into public.products (id, shop_id, name, name_hi, category_id, unit_code, price_paise, mrp_paise,
                                   tax_rate_code, hsn_code, track_stock, low_stock_threshold_milli, is_active, created_by)
      values (v_id, p_shop_id, btrim(p_input ->> 'name'), nullif(btrim(p_input ->> 'nameHi'), ''),
              (p_input ->> 'categoryId')::uuid, coalesce(p_input ->> 'unitCode', 'pc'), v_price, v_mrp,
              nullif(p_input ->> 'taxRateCode', ''), nullif(p_input ->> 'hsnCode', ''),
              coalesce((p_input ->> 'trackStock')::boolean, false), (p_input ->> 'lowStockThresholdMilli')::bigint,
              coalesce((p_input ->> 'isActive')::boolean, true), auth.uid());
    else
      if v_existing.archived_at is not null then
        perform private.raise_ds('DS_NOT_FOUND', '{"reason":"archived"}');
      end if;
      update public.products
         set name = btrim(p_input ->> 'name'),
             name_hi = nullif(btrim(p_input ->> 'nameHi'), ''),
             category_id = (p_input ->> 'categoryId')::uuid,
             unit_code = coalesce(p_input ->> 'unitCode', unit_code),
             price_paise = v_price,
             mrp_paise = v_mrp,
             tax_rate_code = nullif(p_input ->> 'taxRateCode', ''),
             hsn_code = nullif(p_input ->> 'hsnCode', ''),
             track_stock = coalesce((p_input ->> 'trackStock')::boolean, track_stock),
             low_stock_threshold_milli = (p_input ->> 'lowStockThresholdMilli')::bigint,
             is_active = coalesce((p_input ->> 'isActive')::boolean, is_active)
       where id = v_id;
    end if;

    delete from public.product_barcodes where shop_id = p_shop_id and product_id = v_id and barcode <> all (v_barcodes);
    insert into public.product_barcodes (shop_id, product_id, barcode)
    select p_shop_id, v_id, b from unnest(v_barcodes) b
    on conflict (shop_id, barcode) do nothing;
    if exists (select 1 from unnest(v_barcodes) b
                where not exists (select 1 from public.product_barcodes pb
                                   where pb.shop_id = p_shop_id and pb.barcode = b and pb.product_id = v_id)) then
      perform private.raise_ds('DS_CONFLICT', '{"field":"barcodes","reason":"barcode_in_use"}');
    end if;

    delete from public.product_aliases where shop_id = p_shop_id and product_id = v_id and lower(alias) <> all (
      array(select lower(a) from unnest(v_aliases) a));
    insert into public.product_aliases (shop_id, product_id, alias)
    select p_shop_id, v_id, a from unnest(v_aliases) a
    on conflict (product_id, lower(alias)) do nothing;
  exception
    when check_violation or foreign_key_violation or invalid_text_representation then
      perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('reason', sqlerrm));
  end;

  perform private.refresh_product_search_text(v_id);
  select * into v_product from public.products where id = v_id;
  return private.product_json(v_product, true);
end;
$$;

create or replace function public.archive_product(p_shop_id uuid, p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_member(p_shop_id, 'product.manage');
  update public.products set archived_at = now(), is_active = false
   where shop_id = p_shop_id and id = p_product_id and archived_at is null;
  if not found then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  -- Free the barcodes so a replacement product can use them.
  delete from public.product_barcodes where shop_id = p_shop_id and product_id = p_product_id;
  perform private.write_audit('shop_user', 'product.archived', p_shop_id, 'product', p_product_id::text);
end;
$$;

-- Search by name / Hindi name / alias (trigram) or exact barcode. Empty query lists alphabetically.
-- Offset paging: results are ranked, and catalogues are small enough (≤ tens of thousands).
create or replace function public.search_products(p_shop_id uuid, p_query text default null, p_category_id uuid default null,
                                                   p_limit integer default 30, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_show_cost boolean;
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
begin
  v_role := private.require_member(p_shop_id);
  v_show_cost := exists (select 1 from public.role_permissions rp where rp.role = v_role and rp.permission = 'product.view_cost');

  select coalesce(jsonb_agg(private.product_json(r.p, v_show_cost) order by r.rank desc, lower((r.p).name), (r.p).id), '[]'::jsonb)
    into v_items
    from (
      select p, case
                  when v_q = '' then 0
                  when exists (select 1 from public.product_barcodes b
                                where b.shop_id = p.shop_id and b.product_id = p.id and lower(b.barcode) = v_q) then 3
                  when p.search_text like v_q || '%' then 2
                  when p.search_text like '%' || v_q || '%' then 1.5
                  else extensions.similarity(p.search_text, v_q)
                end as rank
        from public.products p
       where p.shop_id = p_shop_id
         and p.archived_at is null
         and (p_category_id is null or p.category_id = p_category_id)
         and (v_q = ''
              or p.search_text like '%' || v_q || '%'
              or extensions.similarity(p.search_text, v_q) > 0.2
              or exists (select 1 from public.product_barcodes b
                          where b.shop_id = p.shop_id and b.product_id = p.id and lower(b.barcode) = v_q))
       order by rank desc, lower(p.name), p.id
       limit v_limit + 1 offset v_offset
    ) r;

  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                select x from jsonb_array_elements(v_items) with ordinality t(x, n) where n <= v_limit order by n) s),
    'nextOffset', case when jsonb_array_length(v_items) > v_limit then v_offset + v_limit end
  );
end;
$$;

create or replace function public.get_product(p_shop_id uuid, p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_product public.products;
begin
  v_role := private.require_member(p_shop_id);
  select * into v_product from public.products where shop_id = p_shop_id and id = p_product_id and archived_at is null;
  if v_product.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  return private.product_json(v_product,
    exists (select 1 from public.role_permissions rp where rp.role = v_role and rp.permission = 'product.view_cost'));
end;
$$;

-- ===========================================================================
-- 6. CSV import: jobs, staged rows, validation, commit
-- ===========================================================================
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  kind text not null default 'products' check (kind in ('products')),
  status text not null default 'draft' check (status in ('draft', 'review', 'committed', 'cancelled')),
  file_name text not null check (char_length(file_name) between 1 and 200),
  row_count integer not null default 0,
  valid_count integer not null default 0,
  error_count integer not null default 0,
  create_count integer not null default 0,
  update_count integer not null default 0,
  skip_count integer not null default 0,
  client_operation_id uuid not null,
  created_by uuid not null references auth.users (id),
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id),
  unique (shop_id, client_operation_id)
);
create index import_jobs_shop on public.import_jobs (shop_id, created_at desc);
create index import_jobs_created_by on public.import_jobs (created_by);
create trigger import_jobs_updated_at before update on public.import_jobs
  for each row execute function private.set_updated_at();

create table public.import_job_rows (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  job_id uuid not null,
  row_number integer not null check (row_number > 0),
  raw jsonb not null,
  normalized jsonb,
  errors text[] not null default '{}',
  action text not null default 'create' check (action in ('create', 'update', 'skip')),
  skipped_by_user boolean not null default false,
  matched_product_id uuid,
  foreign key (shop_id, job_id) references public.import_jobs (shop_id, id) on delete cascade,
  unique (job_id, row_number)
);
create index import_job_rows_job on public.import_job_rows (shop_id, job_id, row_number);

alter table public.import_jobs enable row level security;
alter table public.import_job_rows enable row level security;
revoke all on public.import_jobs, public.import_job_rows from anon, authenticated;
create policy import_jobs_select on public.import_jobs for select to authenticated
  using ((select rls.has_permission(shop_id, 'product.manage')));
create policy import_job_rows_select on public.import_job_rows for select to authenticated
  using ((select rls.has_permission(shop_id, 'product.manage')));
grant select on public.import_jobs, public.import_job_rows to authenticated;

-- Parses a rupee amount ("₹1,250.50", "Rs 40", "99.9") into paise. Null when not a valid amount.
create or replace function private.parse_rupees(p_text text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
           when v ~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then (v::numeric * 100)::bigint
         end
    from (select regexp_replace(regexp_replace(lower(btrim(coalesce(p_text, ''))), '^(₹|rs\.?|inr)\s*', ''), '[,\s]', '', 'g') as v) s;
$$;

-- Validates one staged row against the shop and the rest of the job. Writes normalized/errors/action.
create or replace function private.validate_import_row(p_row_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.import_job_rows;
  v_errors text[] := '{}';
  v_name text;
  v_price bigint;
  v_mrp bigint;
  v_unit text;
  v_tax text;
  v_barcode text;
  v_hsn text;
  v_match uuid;
  v_raw_text text;
begin
  select * into r from public.import_job_rows where id = p_row_id;
  v_name := btrim(coalesce(r.raw ->> 'name', ''));
  if v_name = '' then
    v_errors := array_append(v_errors, 'REQUIRED_NAME');
  elsif char_length(v_name) > 120 then
    v_errors := array_append(v_errors, 'TOO_LONG_NAME');
  end if;

  v_raw_text := r.raw ->> 'price';
  v_price := private.parse_rupees(v_raw_text);
  if coalesce(btrim(v_raw_text), '') = '' then
    v_errors := array_append(v_errors, 'REQUIRED_PRICE');
  elsif v_price is null or v_price > 100000000 then
    v_errors := array_append(v_errors, 'INVALID_PRICE');
  end if;

  v_raw_text := r.raw ->> 'mrp';
  if coalesce(btrim(v_raw_text), '') <> '' then
    v_mrp := private.parse_rupees(v_raw_text);
    if v_mrp is null or v_mrp > 100000000 then
      v_errors := array_append(v_errors, 'INVALID_MRP');
    end if;
  end if;

  v_raw_text := lower(btrim(coalesce(r.raw ->> 'unit', '')));
  if v_raw_text = '' then
    v_unit := 'pc';
  else
    select unit_code into v_unit from private.unit_synonyms where synonym = v_raw_text;
    if v_unit is null then
      v_errors := array_append(v_errors, 'UNKNOWN_UNIT');
    end if;
  end if;

  v_raw_text := upper(regexp_replace(btrim(coalesce(r.raw ->> 'taxRate', '')), '[%\s]', '', 'g'));
  if v_raw_text <> '' then
    select t.code into v_tax from public.tax_rates t
     where (t.code = v_raw_text or (v_raw_text ~ '^[0-9]+(\.[0-9]+)?$' and t.rate_bp = (v_raw_text::numeric * 100)::integer))
       and t.effective_from <= current_date and (t.effective_to is null or t.effective_to > current_date)
     limit 1;
    if v_tax is null then
      v_errors := array_append(v_errors, 'UNKNOWN_TAX_RATE');
    end if;
  end if;

  v_hsn := nullif(btrim(coalesce(r.raw ->> 'hsn', '')), '');
  if v_hsn is not null and v_hsn !~ '^[0-9]{4,8}$' then
    v_errors := array_append(v_errors, 'INVALID_HSN');
  end if;

  v_barcode := nullif(btrim(coalesce(r.raw ->> 'barcode', '')), '');
  if v_barcode is not null and v_barcode !~ '^[A-Za-z0-9\-\.]{3,64}$' then
    v_errors := array_append(v_errors, 'INVALID_BARCODE');
  end if;

  -- Match an existing product: barcode first, then exact name.
  if v_barcode is not null then
    select b.product_id into v_match from public.product_barcodes b where b.shop_id = r.shop_id and b.barcode = v_barcode;
  end if;
  if v_match is null and v_name <> '' then
    select p.id into v_match from public.products p
     where p.shop_id = r.shop_id and p.archived_at is null and lower(p.name) = lower(v_name)
     order by p.created_at limit 1;
  end if;
  if v_barcode is not null and v_match is not null
     and exists (select 1 from public.product_barcodes b where b.shop_id = r.shop_id and b.barcode = v_barcode
                  and b.product_id <> v_match) then
    v_errors := array_append(v_errors, 'BARCODE_TAKEN');
  end if;

  -- Earlier row in the same file with the same name or barcode.
  if exists (select 1 from public.import_job_rows o
              where o.job_id = r.job_id and o.row_number < r.row_number and not o.skipped_by_user
                and ((v_name <> '' and lower(btrim(o.raw ->> 'name')) = lower(v_name))
                     or (v_barcode is not null and btrim(o.raw ->> 'barcode') = v_barcode))) then
    v_errors := array_append(v_errors, 'DUPLICATE_IN_FILE');
  end if;

  update public.import_job_rows
     set errors = v_errors,
         matched_product_id = v_match,
         action = case when skipped_by_user then 'skip' when v_match is not null then 'update' else 'create' end,
         normalized = jsonb_strip_nulls(jsonb_build_object(
           'name', nullif(v_name, ''),
           'nameHi', nullif(btrim(coalesce(r.raw ->> 'nameHi', '')), ''),
           'category', nullif(left(btrim(coalesce(r.raw ->> 'category', '')), 80), ''),
           'unitCode', v_unit,
           'pricePaise', v_price,
           'mrpPaise', v_mrp,
           'taxRateCode', v_tax,
           'hsnCode', v_hsn,
           'barcode', v_barcode))
   where id = p_row_id;
end;
$$;

create or replace function private.refresh_import_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row_id uuid;
  v_job public.import_jobs;
begin
  for v_row_id in select id from public.import_job_rows where job_id = p_job_id order by row_number loop
    perform private.validate_import_row(v_row_id);
  end loop;
  update public.import_jobs j
     set row_count = s.total,
         error_count = s.errors,
         valid_count = s.total - s.errors - s.skips,
         create_count = s.creates,
         update_count = s.updates,
         skip_count = s.skips
    from (select count(*) as total,
                 count(*) filter (where cardinality(errors) > 0 and action <> 'skip') as errors,
                 count(*) filter (where action = 'skip') as skips,
                 count(*) filter (where action = 'create' and cardinality(errors) = 0) as creates,
                 count(*) filter (where action = 'update' and cardinality(errors) = 0) as updates
            from public.import_job_rows where job_id = p_job_id) s
   where j.id = p_job_id
  returning j.* into v_job;
  return private.import_job_json(v_job);
end;
$$;

create or replace function private.import_job_json(j public.import_jobs)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('jobId', j.id, 'status', j.status, 'fileName', j.file_name, 'rowCount', j.row_count,
                            'validCount', j.valid_count, 'errorCount', j.error_count, 'createCount', j.create_count,
                            'updateCount', j.update_count, 'skipCount', j.skip_count, 'committedAt', j.committed_at);
$$;

create or replace function private.require_import_job(p_job_id uuid, p_lock boolean default false)
returns public.import_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.import_jobs;
begin
  if p_lock then
    select * into v_job from public.import_jobs where id = p_job_id for update;
  else
    select * into v_job from public.import_jobs where id = p_job_id;
  end if;
  if v_job.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  perform private.require_member(v_job.shop_id, 'product.manage');
  return v_job;
end;
$$;

create or replace function public.create_import_job(p_shop_id uuid, p_file_name text, p_client_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.import_jobs;
begin
  perform private.require_member(p_shop_id, 'product.manage');
  perform private.assert_entitlement(p_shop_id, 'catalogue.import');
  select * into v_job from public.import_jobs where shop_id = p_shop_id and client_operation_id = p_client_operation_id;
  if v_job.id is null then
    insert into public.import_jobs (shop_id, file_name, client_operation_id, created_by)
    values (p_shop_id, left(btrim(coalesce(p_file_name, 'import.csv')), 200), p_client_operation_id, auth.uid())
    returning * into v_job;
  end if;
  return private.import_job_json(v_job);
end;
$$;

-- Appends parsed rows (field names already mapped by the client) and revalidates the job.
-- p_rows: [{ "rowNumber": 2, "name": "...", "price": "40", "unit": "kg", ... }]. Values are strings as typed.
create or replace function public.stage_import_rows(p_job_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.import_jobs;
  v_limit jsonb;
  v_total bigint;
begin
  v_job := private.require_import_job(p_job_id, true);
  if v_job.status not in ('draft', 'review') then
    perform private.raise_ds('DS_CONFLICT', jsonb_build_object('reason', 'job_' || v_job.status));
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"rows_must_be_array_of_at_most_1000"}');
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x
              where jsonb_typeof(x) <> 'object' or coalesce(x ->> 'rowNumber', '') !~ '^[1-9][0-9]{0,6}$') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_row_number"}');
  end if;

  insert into public.import_job_rows (shop_id, job_id, row_number, raw)
  select v_job.shop_id, v_job.id, (x ->> 'rowNumber')::integer,
         jsonb_strip_nulls(jsonb_build_object(
           'name', left(x ->> 'name', 200), 'nameHi', left(x ->> 'nameHi', 200), 'category', left(x ->> 'category', 200),
           'unit', left(x ->> 'unit', 40), 'price', left(x ->> 'price', 40), 'mrp', left(x ->> 'mrp', 40),
           'taxRate', left(x ->> 'taxRate', 20), 'hsn', left(x ->> 'hsn', 20), 'barcode', left(x ->> 'barcode', 80)))
    from jsonb_array_elements(p_rows) x
  on conflict (job_id, row_number) do update set raw = excluded.raw;

  select count(*) into v_total from public.import_job_rows where job_id = v_job.id;
  v_limit := private.resolve_entitlements(v_job.shop_id) -> 'import.rows_per_job';
  if v_limit is not null and jsonb_typeof(v_limit) <> 'null' and v_total > (v_limit #>> '{}')::bigint then
    perform private.raise_ds('DS_QUOTA_EXCEEDED',
      jsonb_build_object('key', 'import.rows_per_job', 'limit', (v_limit #>> '{}')::bigint, 'used', v_total));
  end if;

  update public.import_jobs set status = 'review' where id = v_job.id;
  return private.refresh_import_job(v_job.id);
end;
$$;

-- Fixes a row (fields in p_patch replace the typed values) and/or skips it.
create or replace function public.update_import_row(p_row_id uuid, p_patch jsonb default '{}', p_skip boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.import_job_rows;
  v_job public.import_jobs;
begin
  select * into v_row from public.import_job_rows where id = p_row_id;
  if v_row.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  v_job := private.require_import_job(v_row.job_id, true);
  if v_job.status <> 'review' then
    perform private.raise_ds('DS_CONFLICT', jsonb_build_object('reason', 'job_' || v_job.status));
  end if;
  if exists (select 1 from jsonb_object_keys(coalesce(p_patch, '{}')) k
              where k not in ('name', 'nameHi', 'category', 'unit', 'price', 'mrp', 'taxRate', 'hsn', 'barcode')) then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"unknown_fields"}');
  end if;
  update public.import_job_rows
     set raw = raw || coalesce(p_patch, '{}'),
         skipped_by_user = coalesce(p_skip, skipped_by_user)
   where id = p_row_id;
  return private.refresh_import_job(v_job.id);
end;
$$;

create or replace function public.cancel_import_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.import_jobs;
begin
  v_job := private.require_import_job(p_job_id, true);
  if v_job.status = 'committed' then
    perform private.raise_ds('DS_CONFLICT', '{"reason":"job_committed"}');
  end if;
  update public.import_jobs set status = 'cancelled' where id = p_job_id;
end;
$$;

-- Applies every valid, non-skipped row in one transaction. Refuses while any non-skipped row has errors.
create or replace function public.commit_product_import(p_job_id uuid, p_client_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.import_jobs;
  v_replay jsonb;
  v_payload jsonb := jsonb_build_object('jobId', p_job_id);
  r public.import_job_rows;
  n jsonb;
  v_category uuid;
  v_product uuid;
  v_created integer := 0;
  v_updated integer := 0;
  v_result jsonb;
begin
  v_job := private.require_import_job(p_job_id, true);
  v_replay := private.idem_get(v_job.shop_id, p_client_operation_id, 'commit_product_import', v_payload);
  if v_replay is not null then
    return v_replay;
  end if;
  if v_job.status <> 'review' then
    perform private.raise_ds('DS_CONFLICT', jsonb_build_object('reason', 'job_' || v_job.status));
  end if;
  perform private.assert_entitlement(v_job.shop_id, 'catalogue.import');
  perform private.refresh_import_job(p_job_id);
  select * into v_job from public.import_jobs where id = p_job_id;
  if v_job.error_count > 0 then
    perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('reason', 'rows_with_errors', 'count', v_job.error_count));
  end if;

  for r in select * from public.import_job_rows
            where job_id = p_job_id and action <> 'skip' and cardinality(errors) = 0 order by row_number loop
    n := r.normalized;
    v_category := null;
    if n ? 'category' then
      select id into v_category from public.categories
       where shop_id = v_job.shop_id and archived_at is null and lower(name) = lower(n ->> 'category');
      if v_category is null then
        insert into public.categories (shop_id, name, created_by) values (v_job.shop_id, n ->> 'category', auth.uid())
        returning id into v_category;
      end if;
    end if;

    if r.action = 'update' then
      v_product := r.matched_product_id;
      update public.products
         set price_paise = (n ->> 'pricePaise')::bigint,
             mrp_paise = coalesce((n ->> 'mrpPaise')::bigint, mrp_paise),
             name_hi = coalesce(n ->> 'nameHi', name_hi),
             unit_code = coalesce(n ->> 'unitCode', unit_code),
             category_id = coalesce(v_category, category_id),
             tax_rate_code = coalesce(n ->> 'taxRateCode', tax_rate_code),
             hsn_code = coalesce(n ->> 'hsnCode', hsn_code)
       where shop_id = v_job.shop_id and id = v_product;
      v_updated := v_updated + 1;
    else
      v_product := gen_random_uuid();
      insert into public.products (id, shop_id, name, name_hi, category_id, unit_code, price_paise, mrp_paise,
                                   tax_rate_code, hsn_code, created_by)
      values (v_product, v_job.shop_id, n ->> 'name', n ->> 'nameHi', v_category, n ->> 'unitCode',
              (n ->> 'pricePaise')::bigint, (n ->> 'mrpPaise')::bigint, n ->> 'taxRateCode', n ->> 'hsnCode', auth.uid());
      v_created := v_created + 1;
    end if;
    if n ? 'barcode' then
      insert into public.product_barcodes (shop_id, product_id, barcode)
      values (v_job.shop_id, v_product, n ->> 'barcode')
      on conflict (shop_id, barcode) do nothing;
    end if;
  end loop;

  update public.import_jobs set status = 'committed', committed_at = now() where id = p_job_id;
  perform private.write_audit('shop_user', 'catalogue.imported', v_job.shop_id, 'import_job', p_job_id::text, null,
                              jsonb_build_object('created', v_created, 'updated', v_updated));
  v_result := jsonb_build_object('jobId', p_job_id, 'created', v_created, 'updated', v_updated);
  return private.idem_put(v_job.shop_id, p_client_operation_id, 'commit_product_import', v_payload, v_result);
end;
$$;

-- ===========================================================================
-- 7. Function privileges
-- ===========================================================================
revoke execute on all functions in schema private from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.get_catalogue_reference(uuid)',
    'public.save_category(uuid, uuid, text, text)',
    'public.archive_category(uuid, uuid)',
    'public.save_product(uuid, jsonb)',
    'public.archive_product(uuid, uuid)',
    'public.search_products(uuid, text, uuid, integer, integer)',
    'public.get_product(uuid, uuid)',
    'public.create_import_job(uuid, text, uuid)',
    'public.stage_import_rows(uuid, jsonb)',
    'public.update_import_row(uuid, jsonb, boolean)',
    'public.cancel_import_job(uuid)',
    'public.commit_product_import(uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
