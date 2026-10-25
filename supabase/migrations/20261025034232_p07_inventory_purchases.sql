-- Phase 07: stock adjustments and counts, low-stock list, stock drift check, suppliers + ledger, purchases,
-- supplier payments (features/inventory-and-purchases.md, API_AND_RPC_CONTRACTS.md §5.4–5.5).

-- ===========================================================================
-- 1. Stock movements: reasons, purchases
-- ===========================================================================
alter table public.stock_movements
  add column reason text check (reason is null or reason in ('damage', 'expiry', 'count_correction', 'opening', 'other')),
  add column note text check (note is null or char_length(note) <= 200),
  add column purchase_id uuid;

-- Sum of movements for a product: what stock_on_hand_milli must equal (ADR-047).
create or replace function private.stock_from_movements(p_shop_id uuid, p_product_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(quantity_milli), 0)::bigint from public.stock_movements
   where shop_id = p_shop_id and product_id = p_product_id;
$$;

-- Applies one signed stock change for a locked, tracked product and returns the new on-hand quantity.
create or replace function private.move_stock(p_shop_id uuid, p_product_id uuid, p_kind text, p_qty bigint,
                                              p_reason text default null, p_note text default null,
                                              p_sale_id uuid default null, p_purchase_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_on_hand bigint;
begin
  insert into public.stock_movements (shop_id, product_id, kind, quantity_milli, reason, note, sale_id, purchase_id, created_by)
  values (p_shop_id, p_product_id, p_kind, p_qty, p_reason, p_note, p_sale_id, p_purchase_id, auth.uid())
  returning id into v_id;
  update public.products set stock_on_hand_milli = stock_on_hand_milli + p_qty
   where shop_id = p_shop_id and id = p_product_id
  returning stock_on_hand_milli into v_on_hand;
  return jsonb_build_object('movementId', v_id, 'stockOnHandMilli', v_on_hand);
end;
$$;

-- Locks a product of the shop that tracks stock; raises when it does not exist or is not tracked.
create or replace function private.lock_tracked_product(p_shop_id uuid, p_product_id uuid)
returns record
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select p.id, p.stock_on_hand_milli, p.track_stock, u.allows_fraction into v_row
    from public.products p join public.units u on u.code = p.unit_code
   where p.shop_id = p_shop_id and p.id = p_product_id and p.archived_at is null
     for update of p;
  if v_row.id is null then
    perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('field', 'productId', 'productId', p_product_id));
  end if;
  if not v_row.track_stock then
    perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('field', 'productId', 'reason', 'not_tracked',
                                                                        'productId', p_product_id));
  end if;
  return v_row;
end;
$$;

-- ===========================================================================
-- 2. Adjustments and stock counts
-- ===========================================================================
create or replace function public.adjust_stock(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_op_id uuid;
  v_replay jsonb;
  v_product record;
  v_delta bigint;
  v_reason text;
  v_result jsonb;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_input"}');
  end if;
  v_shop_id := (p_input ->> 'shopId')::uuid;
  perform private.require_member(v_shop_id, 'stock.adjust');
  v_op_id := (p_input ->> 'clientOperationId')::uuid;
  v_replay := private.idem_get(v_shop_id, v_op_id, 'adjust_stock', p_input);
  if v_replay is not null then
    return v_replay;
  end if;
  v_reason := p_input ->> 'reason';
  if v_reason is null or v_reason not in ('damage', 'expiry', 'count_correction', 'opening', 'other') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"reason"}');
  end if;
  if char_length(p_input ->> 'note') > 200 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"note"}');
  end if;
  v_product := private.lock_tracked_product(v_shop_id, (p_input ->> 'productId')::uuid);
  v_delta := (p_input ->> 'deltaMilli')::bigint;
  if v_delta is null or v_delta = 0 or abs(v_delta) > 1000000000
     or (not v_product.allows_fraction and v_delta % 1000 <> 0) then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"deltaMilli"}');
  end if;

  v_result := private.move_stock(v_shop_id, v_product.id, case when v_reason = 'opening' then 'opening' else 'adjustment' end,
                                 v_delta, v_reason, nullif(btrim(p_input ->> 'note'), ''));
  perform private.write_audit('shop_user', 'stock.adjusted', v_shop_id, 'product', v_product.id::text,
    jsonb_build_object('stockOnHandMilli', v_product.stock_on_hand_milli),
    jsonb_build_object('stockOnHandMilli', (v_result ->> 'stockOnHandMilli')::bigint, 'deltaMilli', v_delta, 'reason', v_reason),
    nullif(btrim(p_input ->> 'note'), ''));
  return private.idem_put(v_shop_id, v_op_id, 'adjust_stock', p_input, v_result);
end;
$$;

-- Counted quantities for many products in one transaction; the difference to on-hand is computed under lock.
create or replace function public.submit_stock_count(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_op_id uuid;
  v_replay jsonb;
  v_count jsonb;
  v_product record;
  v_counted bigint;
  v_items jsonb := '[]'::jsonb;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_input"}');
  end if;
  v_shop_id := (p_input ->> 'shopId')::uuid;
  perform private.require_member(v_shop_id, 'stock.adjust');
  v_op_id := (p_input ->> 'clientOperationId')::uuid;
  v_replay := private.idem_get(v_shop_id, v_op_id, 'submit_stock_count', p_input);
  if v_replay is not null then
    return v_replay;
  end if;
  if jsonb_typeof(p_input -> 'counts') is distinct from 'array' or jsonb_array_length(p_input -> 'counts') not between 1 and 500 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"counts"}');
  end if;
  if (select count(distinct c ->> 'productId') from jsonb_array_elements(p_input -> 'counts') c)
     <> jsonb_array_length(p_input -> 'counts') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"counts","reason":"duplicate_product"}');
  end if;

  -- Lock in a fixed order so two counts never deadlock.
  for v_count in
    select c from jsonb_array_elements(p_input -> 'counts') c order by c ->> 'productId'
  loop
    v_product := private.lock_tracked_product(v_shop_id, (v_count ->> 'productId')::uuid);
    v_counted := (v_count ->> 'countedMilli')::bigint;
    if v_counted is null or v_counted < 0 or (not v_product.allows_fraction and v_counted % 1000 <> 0) then
      perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('field', 'countedMilli', 'productId', v_product.id));
    end if;
    if v_counted <> v_product.stock_on_hand_milli then
      perform private.move_stock(v_shop_id, v_product.id, 'adjustment', v_counted - v_product.stock_on_hand_milli,
                                 'count_correction', nullif(btrim(p_input ->> 'note'), ''));
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'productId', v_product.id, 'previousMilli', v_product.stock_on_hand_milli, 'countedMilli', v_counted,
      'deltaMilli', v_counted - v_product.stock_on_hand_milli));
  end loop;
  perform private.write_audit('shop_user', 'stock.counted', v_shop_id, 'stock_count', v_op_id::text, null,
    jsonb_build_object('items', v_items), nullif(btrim(p_input ->> 'note'), ''));
  return private.idem_put(v_shop_id, v_op_id, 'submit_stock_count', p_input, jsonb_build_object('items', v_items));
end;
$$;

-- Tracked products with stock and thresholds; low_only = at or below the low-stock threshold.
create or replace function public.list_stock(p_shop_id uuid, p_low_only boolean default false, p_query text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(lower(btrim(p_query)), '');
begin
  perform private.require_member(p_shop_id, 'stock.view');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'productId', p.id, 'name', p.name, 'nameHi', p.name_hi, 'unitCode', p.unit_code,
             'allowsFraction', u.allows_fraction, 'stockOnHandMilli', p.stock_on_hand_milli,
             'lowStockThresholdMilli', p.low_stock_threshold_milli,
             'isLow', p.low_stock_threshold_milli is not null and p.stock_on_hand_milli <= p.low_stock_threshold_milli)
           order by (p.low_stock_threshold_milli is not null and p.stock_on_hand_milli <= p.low_stock_threshold_milli) desc,
                    lower(p.name))
      from public.products p join public.units u on u.code = p.unit_code
     where p.shop_id = p_shop_id and p.archived_at is null and p.track_stock
       and (not coalesce(p_low_only, false)
            or (p.low_stock_threshold_milli is not null and p.stock_on_hand_milli <= p.low_stock_threshold_milli))
       and (v_q is null or p.search_text like '%' || v_q || '%')
  ), '[]'::jsonb);
end;
$$;

-- Owner check: tracked products whose on-hand differs from the sum of their movements (should always be empty).
create or replace function public.check_stock_drift(p_shop_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  v_role := private.require_member(p_shop_id, 'stock.adjust');
  return coalesce((
    select jsonb_agg(jsonb_build_object('productId', p.id, 'name', p.name, 'stockOnHandMilli', p.stock_on_hand_milli,
                                        'fromMovementsMilli', m.total) order by p.name)
      from public.products p
      cross join lateral (select private.stock_from_movements(p.shop_id, p.id) as total) m
     where p.shop_id = p_shop_id and p.stock_on_hand_milli <> m.total
  ), '[]'::jsonb);
end;
$$;

-- ===========================================================================
-- 3. Suppliers and their ledger (+ = we owe more, − = we paid)
-- ===========================================================================
create table public.suppliers (
  id uuid primary key,                         -- client-generated, so creating twice is safe
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+91[6-9][0-9]{9}$'),
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  note text check (note is null or char_length(note) <= 200),
  balance_paise bigint not null default 0,
  archived_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id)
);
create unique index suppliers_shop_name on public.suppliers (shop_id, lower(name)) where archived_at is null;
create index suppliers_created_by on public.suppliers (created_by);
create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function private.set_updated_at();

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  supplier_id uuid,
  device_id uuid,
  business_date date not null,
  supplier_invoice_no text check (supplier_invoice_no is null or char_length(supplier_invoice_no) <= 40),
  supplier_invoice_date date,
  total_paise bigint not null check (total_paise >= 0),
  paid_paise bigint not null check (paid_paise >= 0),
  note text check (note is null or char_length(note) <= 200),
  client_operation_id uuid not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (shop_id, id),
  unique (shop_id, client_operation_id),
  foreign key (shop_id, supplier_id) references public.suppliers (shop_id, id),
  foreign key (shop_id, device_id) references public.shop_devices (shop_id, id),
  check (paid_paise <= total_paise),
  check (supplier_id is not null or paid_paise = total_paise)
);
create index purchases_shop_date on public.purchases (shop_id, business_date desc);
create index purchases_supplier on public.purchases (shop_id, supplier_id);
create index purchases_created_by on public.purchases (created_by);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  purchase_id uuid not null,
  line_no smallint not null check (line_no between 1 and 200),
  product_id uuid not null,
  name text not null,
  quantity_milli bigint not null check (quantity_milli > 0),
  unit_cost_paise bigint not null check (unit_cost_paise >= 0),
  amount_paise bigint not null check (amount_paise >= 0),
  foreign key (shop_id, purchase_id) references public.purchases (shop_id, id) on delete cascade,
  foreign key (shop_id, product_id) references public.products (shop_id, id),
  unique (purchase_id, line_no)
);
create index purchase_items_purchase on public.purchase_items (shop_id, purchase_id);
create index purchase_items_product on public.purchase_items (shop_id, product_id);

alter table public.stock_movements add constraint stock_movements_purchase_fk
  foreign key (shop_id, purchase_id) references public.purchases (shop_id, id);
create index stock_movements_purchase on public.stock_movements (shop_id, purchase_id) where purchase_id is not null;

create table public.supplier_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  supplier_id uuid not null,
  kind text not null check (kind in ('opening', 'purchase', 'payment')),
  amount_paise bigint not null check (amount_paise <> 0),
  method text check (method is null or method in ('cash', 'upi', 'card', 'other')),
  purchase_id uuid,
  device_id uuid,
  business_date date not null,
  note text check (note is null or char_length(note) <= 200),
  client_operation_id uuid,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (shop_id, supplier_id) references public.suppliers (shop_id, id),
  foreign key (shop_id, purchase_id) references public.purchases (shop_id, id),
  foreign key (shop_id, device_id) references public.shop_devices (shop_id, id),
  check ((kind = 'payment') = (method is not null)),
  check (kind <> 'payment' or amount_paise < 0),
  check (kind <> 'purchase' or amount_paise > 0)
);
create index supplier_ledger_supplier on public.supplier_ledger_entries (shop_id, supplier_id, created_at desc);
create index supplier_ledger_date on public.supplier_ledger_entries (shop_id, business_date);
create index supplier_ledger_purchase on public.supplier_ledger_entries (shop_id, purchase_id) where purchase_id is not null;
create index supplier_ledger_created_by on public.supplier_ledger_entries (created_by);

-- Cash paid to suppliers without a supplier account (cash purchases) is recorded here for day close.
create table public.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  purchase_id uuid not null,
  method text not null check (method in ('cash', 'upi', 'card', 'other')),
  amount_paise bigint not null check (amount_paise > 0),
  foreign key (shop_id, purchase_id) references public.purchases (shop_id, id) on delete cascade
);
create index purchase_payments_purchase on public.purchase_payments (shop_id, purchase_id);

-- Adds a ledger entry and keeps suppliers.balance_paise equal to the sum of entries (same transaction).
create or replace function private.add_supplier_entry(p_shop_id uuid, p_supplier_id uuid, p_kind text, p_amount bigint,
                                                      p_method text, p_purchase_id uuid, p_device_id uuid, p_note text,
                                                      p_op_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
begin
  insert into public.supplier_ledger_entries (shop_id, supplier_id, kind, amount_paise, method, purchase_id, device_id,
                                              business_date, note, client_operation_id, created_by)
  values (p_shop_id, p_supplier_id, p_kind, p_amount, p_method, p_purchase_id, p_device_id,
          private.shop_today(p_shop_id), p_note, p_op_id, auth.uid());
  update public.suppliers set balance_paise = balance_paise + p_amount
   where shop_id = p_shop_id and id = p_supplier_id
  returning balance_paise into v_balance;
  return v_balance;
end;
$$;

alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.purchase_payments enable row level security;
alter table public.supplier_ledger_entries enable row level security;
create policy suppliers_select on public.suppliers for select to authenticated
  using ((select rls.has_permission(shop_id, 'purchase.view')));
create policy purchases_select on public.purchases for select to authenticated
  using ((select rls.has_permission(shop_id, 'purchase.view')));
create policy purchase_items_select on public.purchase_items for select to authenticated
  using ((select rls.has_permission(shop_id, 'purchase.view')));
create policy purchase_payments_select on public.purchase_payments for select to authenticated
  using ((select rls.has_permission(shop_id, 'purchase.view')));
create policy supplier_ledger_select on public.supplier_ledger_entries for select to authenticated
  using ((select rls.has_permission(shop_id, 'purchase.view')));
grant select on public.suppliers, public.purchases, public.purchase_items, public.purchase_payments,
  public.supplier_ledger_entries to authenticated;

-- Creates or edits a supplier (client id). The opening balance is accepted only when the supplier is created.
create or replace function public.save_supplier(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_id uuid;
  v_existing public.suppliers;
  v_row public.suppliers;
  v_opening bigint;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_input"}');
  end if;
  v_shop_id := (p_input ->> 'shopId')::uuid;
  perform private.require_member(v_shop_id, 'purchase.manage');
  perform private.assert_entitlement(v_shop_id, 'purchases.enabled');
  v_id := (p_input ->> 'id')::uuid;
  if v_id is null then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"id"}');
  end if;
  select * into v_existing from public.suppliers where id = v_id;
  if v_existing.id is not null and v_existing.shop_id <> v_shop_id then
    perform private.raise_ds('DS_CONFLICT');
  end if;
  begin
    if v_existing.id is null then
      insert into public.suppliers (id, shop_id, name, phone_e164, gstin, note, created_by)
      values (v_id, v_shop_id, btrim(p_input ->> 'name'), nullif(p_input ->> 'phone', ''), nullif(p_input ->> 'gstin', ''),
              nullif(btrim(p_input ->> 'note'), ''), auth.uid())
      returning * into v_row;
      v_opening := coalesce((p_input ->> 'openingBalancePaise')::bigint, 0);
      if v_opening <> 0 then
        perform private.add_supplier_entry(v_shop_id, v_id, 'opening', v_opening, null, null, null, 'Opening balance', null);
      end if;
    else
      update public.suppliers
         set name = btrim(p_input ->> 'name'), phone_e164 = nullif(p_input ->> 'phone', ''),
             gstin = nullif(p_input ->> 'gstin', ''), note = nullif(btrim(p_input ->> 'note'), '')
       where id = v_id
      returning * into v_row;
    end if;
  exception
    when unique_violation then
      perform private.raise_ds('DS_CONFLICT', '{"field":"name"}');
    when check_violation or not_null_violation then
      perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('reason', sqlerrm));
  end;
  return (select jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone_e164, 'gstin', s.gstin, 'note', s.note,
                                    'balancePaise', s.balance_paise, 'archivedAt', s.archived_at)
            from public.suppliers s where s.id = v_id);
end;
$$;

-- ===========================================================================
-- 4. Purchases and supplier payments
-- ===========================================================================
create or replace function public.receive_purchase(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_op_id uuid;
  v_replay jsonb;
  v_supplier public.suppliers;
  v_device_id uuid;
  v_line jsonb;
  v_product record;
  v_qty bigint;
  v_cost bigint;
  v_rows jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_paid bigint := 0;
  v_payment jsonb;
  v_purchase_id uuid;
  v_balance bigint;
  v_row jsonb;
  v_n integer := 0;
  v_update jsonb;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_input"}');
  end if;
  v_shop_id := (p_input ->> 'shopId')::uuid;
  perform private.require_member(v_shop_id, 'purchase.receive');
  perform private.assert_entitlement(v_shop_id, 'purchases.enabled');
  v_op_id := (p_input ->> 'clientOperationId')::uuid;
  v_replay := private.idem_get(v_shop_id, v_op_id, 'receive_purchase', p_input);
  if v_replay is not null then
    return v_replay;
  end if;

  if p_input ->> 'supplierId' is not null then
    select * into v_supplier from public.suppliers
     where shop_id = v_shop_id and id = (p_input ->> 'supplierId')::uuid and archived_at is null
       for update;
    if v_supplier.id is null then
      perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"supplierId"}');
    end if;
  end if;
  v_device_id := (p_input ->> 'deviceId')::uuid;
  if v_device_id is not null
     and not exists (select 1 from public.shop_devices where shop_id = v_shop_id and id = v_device_id and status = 'active') then
    perform private.raise_ds('DS_DEVICE_NOT_REGISTERED');
  end if;
  if jsonb_typeof(p_input -> 'lines') is distinct from 'array' or jsonb_array_length(p_input -> 'lines') not between 1 and 200 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"lines"}');
  end if;

  -- Lines: products locked in a fixed order; amount = round(cost × qty / 1000).
  for v_line in select l from jsonb_array_elements(p_input -> 'lines') l order by l ->> 'productId' loop
    select p.id, p.name, p.track_stock, u.allows_fraction into v_product
      from public.products p join public.units u on u.code = p.unit_code
     where p.shop_id = v_shop_id and p.id = (v_line ->> 'productId')::uuid and p.archived_at is null
       for update of p;
    if v_product.id is null then
      perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('field', 'productId', 'productId', v_line -> 'productId'));
    end if;
    v_qty := (v_line ->> 'quantityMilli')::bigint;
    v_cost := (v_line ->> 'unitCostPaise')::bigint;
    if v_qty is null or v_qty < 1 or v_qty > 1000000000 or (not v_product.allows_fraction and v_qty % 1000 <> 0)
       or v_cost is null or v_cost < 0 or v_cost > 100000000 then
      perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('field', 'lines', 'productId', v_product.id));
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'productId', v_product.id, 'name', v_product.name, 'trackStock', v_product.track_stock, 'quantityMilli', v_qty,
      'unitCostPaise', v_cost, 'amountPaise', private.round_half_up_div(v_cost::numeric * v_qty, 1000)));
    v_total := v_total + private.round_half_up_div(v_cost::numeric * v_qty, 1000);
  end loop;

  for v_payment in select value from jsonb_array_elements(coalesce(p_input -> 'payments', '[]'::jsonb)) loop
    if v_payment ->> 'method' is null or v_payment ->> 'method' not in ('cash', 'upi', 'card', 'other')
       or (v_payment ->> 'amountPaise')::bigint is null or (v_payment ->> 'amountPaise')::bigint < 1 then
      perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"payments"}');
    end if;
    v_paid := v_paid + (v_payment ->> 'amountPaise')::bigint;
  end loop;
  if v_paid > v_total then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"payments","reason":"more_than_total"}');
  end if;
  if v_supplier.id is null and v_paid <> v_total then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"payments","reason":"unpaid_needs_supplier"}');
  end if;

  insert into public.purchases (shop_id, supplier_id, device_id, business_date, supplier_invoice_no, supplier_invoice_date,
                                total_paise, paid_paise, note, client_operation_id, created_by)
  values (v_shop_id, v_supplier.id, v_device_id, private.shop_today(v_shop_id), nullif(btrim(p_input ->> 'supplierInvoiceNo'), ''),
          (p_input ->> 'supplierInvoiceDate')::date, v_total, v_paid, nullif(btrim(p_input ->> 'note'), ''), v_op_id, auth.uid())
  returning id into v_purchase_id;

  for v_row in select value from jsonb_array_elements(v_rows) loop
    v_n := v_n + 1;
    insert into public.purchase_items (shop_id, purchase_id, line_no, product_id, name, quantity_milli, unit_cost_paise, amount_paise)
    values (v_shop_id, v_purchase_id, v_n, (v_row ->> 'productId')::uuid, v_row ->> 'name', (v_row ->> 'quantityMilli')::bigint,
            (v_row ->> 'unitCostPaise')::bigint, (v_row ->> 'amountPaise')::bigint);
    update public.products set last_cost_paise = (v_row ->> 'unitCostPaise')::bigint
     where shop_id = v_shop_id and id = (v_row ->> 'productId')::uuid;
    if (v_row ->> 'trackStock')::boolean then
      perform private.move_stock(v_shop_id, (v_row ->> 'productId')::uuid, 'purchase', (v_row ->> 'quantityMilli')::bigint,
                                 null, null, null, v_purchase_id);
    end if;
  end loop;

  -- Optional new selling prices (price history is written by the products trigger).
  for v_update in select value from jsonb_array_elements(coalesce(p_input -> 'priceUpdates', '[]'::jsonb)) loop
    if not exists (select 1 from jsonb_array_elements(v_rows) r where r ->> 'productId' = v_update ->> 'productId')
       or (v_update ->> 'pricePaise')::bigint is null or (v_update ->> 'pricePaise')::bigint not between 0 and 100000000 then
      perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"priceUpdates"}');
    end if;
    update public.products set price_paise = (v_update ->> 'pricePaise')::bigint
     where shop_id = v_shop_id and id = (v_update ->> 'productId')::uuid;
  end loop;

  insert into public.purchase_payments (shop_id, purchase_id, method, amount_paise)
  select v_shop_id, v_purchase_id, p ->> 'method', (p ->> 'amountPaise')::bigint
    from jsonb_array_elements(coalesce(p_input -> 'payments', '[]'::jsonb)) p;

  if v_supplier.id is not null then
    v_balance := private.add_supplier_entry(v_shop_id, v_supplier.id, 'purchase', v_total, null, v_purchase_id, v_device_id,
                                            nullif(btrim(p_input ->> 'supplierInvoiceNo'), ''), v_op_id);
    for v_payment in select value from jsonb_array_elements(coalesce(p_input -> 'payments', '[]'::jsonb)) loop
      v_balance := private.add_supplier_entry(v_shop_id, v_supplier.id, 'payment', -(v_payment ->> 'amountPaise')::bigint,
                                              v_payment ->> 'method', v_purchase_id, v_device_id, null, v_op_id);
    end loop;
  end if;

  perform private.write_audit('shop_user', 'purchase.received', v_shop_id, 'purchase', v_purchase_id::text, null,
    jsonb_build_object('totalPaise', v_total, 'paidPaise', v_paid, 'supplierId', v_supplier.id, 'lines', jsonb_array_length(v_rows)));
  return private.idem_put(v_shop_id, v_op_id, 'receive_purchase', p_input, jsonb_build_object(
    'purchaseId', v_purchase_id, 'totalPaise', v_total, 'paidPaise', v_paid, 'supplierBalancePaise', v_balance));
end;
$$;

create or replace function public.record_supplier_payment(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_op_id uuid;
  v_replay jsonb;
  v_supplier public.suppliers;
  v_amount bigint;
  v_device_id uuid;
  v_balance bigint;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_input"}');
  end if;
  v_shop_id := (p_input ->> 'shopId')::uuid;
  perform private.require_member(v_shop_id, 'purchase.pay');
  v_op_id := (p_input ->> 'clientOperationId')::uuid;
  v_replay := private.idem_get(v_shop_id, v_op_id, 'record_supplier_payment', p_input);
  if v_replay is not null then
    return v_replay;
  end if;
  select * into v_supplier from public.suppliers
   where shop_id = v_shop_id and id = (p_input ->> 'supplierId')::uuid for update;
  if v_supplier.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  v_amount := (p_input ->> 'amountPaise')::bigint;
  if v_amount is null or v_amount < 1 or v_amount > 100000000
     or p_input ->> 'method' is null or p_input ->> 'method' not in ('cash', 'upi', 'card', 'other')
     or char_length(p_input ->> 'note') > 200 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"payment"}');
  end if;
  v_device_id := (p_input ->> 'deviceId')::uuid;
  if v_device_id is not null
     and not exists (select 1 from public.shop_devices where shop_id = v_shop_id and id = v_device_id and status = 'active') then
    perform private.raise_ds('DS_DEVICE_NOT_REGISTERED');
  end if;
  v_balance := private.add_supplier_entry(v_shop_id, v_supplier.id, 'payment', -v_amount, p_input ->> 'method', null,
                                          v_device_id, nullif(btrim(p_input ->> 'note'), ''), v_op_id);
  perform private.write_audit('shop_user', 'supplier.paid', v_shop_id, 'supplier', v_supplier.id::text, null,
    jsonb_build_object('amountPaise', v_amount, 'method', p_input ->> 'method', 'balancePaise', v_balance));
  return private.idem_put(v_shop_id, v_op_id, 'record_supplier_payment', p_input,
    jsonb_build_object('supplierId', v_supplier.id, 'balancePaise', v_balance));
end;
$$;

-- ===========================================================================
-- 5. Day close: cash paid to suppliers from this phone leaves the drawer too
-- ===========================================================================
create or replace function private.cash_breakdown(p_shop_id uuid, p_device_id uuid, p_date date, p_opening bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with cash_sales as (
    select coalesce(sum(sp.amount_paise), 0) as v
      from public.sales s join public.sale_payments sp on sp.shop_id = s.shop_id and sp.sale_id = s.id
     where s.shop_id = p_shop_id and s.device_id = p_device_id and s.business_date = p_date
       and s.status <> 'voided' and sp.method = 'cash'),
  cash_refunds as (
    select coalesce(sum(r.refund_paise), 0) as v from public.sale_returns r
     where r.shop_id = p_shop_id and r.device_id = p_device_id and r.business_date = p_date and r.refund_method = 'cash'),
  cash_expenses as (
    select coalesce(sum(e.amount_paise), 0) as v from public.expenses e
     where e.shop_id = p_shop_id and e.device_id = p_device_id and e.business_date = p_date
       and e.voided_at is null and e.method = 'cash'),
  cash_suppliers as (
    -- purchase payments in cash (with or without a supplier account) + separate supplier payments in cash
    select coalesce((select sum(pp.amount_paise) from public.purchases pu
                       join public.purchase_payments pp on pp.shop_id = pu.shop_id and pp.purchase_id = pu.id
                      where pu.shop_id = p_shop_id and pu.device_id = p_device_id and pu.business_date = p_date
                        and pp.method = 'cash'), 0)
         + coalesce((select -sum(l.amount_paise) from public.supplier_ledger_entries l
                      where l.shop_id = p_shop_id and l.device_id = p_device_id and l.business_date = p_date
                        and l.kind = 'payment' and l.method = 'cash' and l.purchase_id is null), 0) as v)
  select jsonb_build_object(
    'openingCashPaise', p_opening,
    'cashSalesPaise', (select v from cash_sales),
    'cashRefundsPaise', (select v from cash_refunds),
    'cashExpensesPaise', (select v from cash_expenses),
    'cashSupplierPaymentsPaise', (select v from cash_suppliers),
    'expectedCashPaise', p_opening + (select v from cash_sales) - (select v from cash_refunds)
                         - (select v from cash_expenses) - (select v from cash_suppliers));
$$;

revoke execute on function private.stock_from_movements(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.move_stock(uuid, uuid, text, bigint, text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.lock_tracked_product(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.add_supplier_entry(uuid, uuid, text, bigint, text, uuid, uuid, text, uuid) from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.adjust_stock(jsonb)',
    'public.submit_stock_count(jsonb)',
    'public.list_stock(uuid, boolean, text)',
    'public.check_stock_drift(uuid)',
    'public.save_supplier(jsonb)',
    'public.receive_purchase(jsonb)',
    'public.record_supplier_payment(jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
