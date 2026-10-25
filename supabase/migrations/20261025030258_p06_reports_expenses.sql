-- Phase 06: business dates, sale returns, expenses (+ private attachment bucket), day close, dashboard,
-- sales report, export quota (features/reports-expenses-dayclose.md).

-- ===========================================================================
-- 1. Business date on sales (the shop's local date of the sale)
-- ===========================================================================
alter table public.sales add column business_date date;
update public.sales s set business_date = (s.occurred_at at time zone sh.timezone)::date
  from public.shops sh where sh.id = s.shop_id;
alter table public.sales alter column business_date set not null;
create index sales_shop_business_date on public.sales (shop_id, business_date);

create or replace function private.set_sale_business_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.business_date is null then
    new.business_date := (new.occurred_at at time zone
      (select timezone from public.shops where id = new.shop_id))::date;
  end if;
  return new;
end;
$$;
create trigger sales_business_date before insert on public.sales
  for each row execute function private.set_sale_business_date();

-- Today in the shop's time zone.
create or replace function private.shop_today(p_shop_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone timezone)::date from public.shops where id = p_shop_id;
$$;

-- ===========================================================================
-- 2. Sale returns
-- ===========================================================================
alter table public.stock_movements drop constraint stock_movements_kind_check;
alter table public.stock_movements add constraint stock_movements_kind_check
  check (kind in ('sale', 'sale_void', 'sale_return', 'purchase', 'adjustment', 'opening', 'import'));
alter table public.stock_movements add column return_id uuid;

create table public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  sale_id uuid not null,
  device_id uuid not null,
  business_date date not null,
  refund_method text not null check (refund_method in ('cash', 'upi', 'card', 'other')),
  refund_paise bigint not null check (refund_paise >= 0),
  reason text not null check (char_length(reason) between 3 and 200),
  client_operation_id uuid not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (shop_id, id),
  unique (shop_id, client_operation_id),
  foreign key (shop_id, sale_id) references public.sales (shop_id, id),
  foreign key (shop_id, device_id) references public.shop_devices (shop_id, id)
);
create index sale_returns_sale on public.sale_returns (shop_id, sale_id);
create index sale_returns_date on public.sale_returns (shop_id, business_date);
create index sale_returns_created_by on public.sale_returns (created_by);

create table public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  return_id uuid not null,
  sale_id uuid not null,
  line_no smallint not null,
  quantity_milli bigint not null check (quantity_milli > 0),
  refund_paise bigint not null check (refund_paise >= 0),
  foreign key (shop_id, return_id) references public.sale_returns (shop_id, id) on delete cascade,
  foreign key (sale_id, line_no) references public.sale_items (sale_id, line_no)
);
create index sale_return_items_return on public.sale_return_items (shop_id, return_id);
create index sale_return_items_line on public.sale_return_items (sale_id, line_no);

alter table public.stock_movements add constraint stock_movements_return_fk
  foreign key (shop_id, return_id) references public.sale_returns (shop_id, id);
create index stock_movements_return on public.stock_movements (shop_id, return_id) where return_id is not null;

alter table public.sale_returns enable row level security;
alter table public.sale_return_items enable row level security;
create policy sale_returns_select on public.sale_returns for select to authenticated
  using (exists (select 1 from public.sales s where s.shop_id = sale_returns.shop_id and s.id = sale_returns.sale_id));
create policy sale_return_items_select on public.sale_return_items for select to authenticated
  using (exists (select 1 from public.sales s where s.shop_id = sale_return_items.shop_id and s.id = sale_return_items.sale_id));
grant select on public.sale_returns, public.sale_return_items to authenticated;

-- Receipts show returns and how much of each line was returned.
create or replace function private.sale_json(p_sale_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'saleId', s.id,
    'shopId', s.shop_id,
    'invoiceNumber', s.invoice_number,
    'status', s.status,
    'reviewReasons', to_jsonb(s.review_reasons),
    'occurredAt', s.occurred_at,
    'createdAt', s.created_at,
    'businessDate', s.business_date,
    'createdByName', p.display_name,
    'taxMode', s.tax_mode,
    'totals', jsonb_build_object(
      'subtotalPaise', s.subtotal_paise, 'discountPaise', s.discount_paise, 'taxPaise', s.tax_paise,
      'roundOffPaise', s.round_off_paise, 'totalPaise', s.total_paise),
    'billDiscountPaise', s.bill_discount_paise,
    'paidPaise', s.paid_paise,
    'udhaarPaise', s.udhaar_paise,
    'note', s.note,
    'voidedAt', s.voided_at,
    'voidReason', s.void_reason,
    'voidedByName', vp.display_name,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'lineNo', i.line_no, 'kind', i.kind, 'productId', i.product_id, 'label', i.label,
               'unitCode', i.unit_code, 'quantityMilli', i.quantity_milli, 'unitPricePaise', i.unit_price_paise,
               'grossPaise', i.gross_paise, 'lineDiscountPaise', i.line_discount_paise,
               'billDiscountSharePaise', i.bill_discount_share_paise, 'netPaise', i.net_paise,
               'taxRateBp', i.tax_rate_bp, 'taxPaise', i.tax_paise, 'hsnCode', i.hsn_code,
               'priceOverridden', i.price_overridden,
               'returnedQuantityMilli', coalesce((select sum(ri.quantity_milli) from public.sale_return_items ri
                                                   where ri.sale_id = i.sale_id and ri.line_no = i.line_no), 0))
             order by i.line_no)
        from public.sale_items i where i.shop_id = s.shop_id and i.sale_id = s.id), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'method', sp.method, 'amountPaise', sp.amount_paise, 'reference', sp.reference,
               'confirmation', sp.confirmation) order by sp.created_at, sp.id)
        from public.sale_payments sp where sp.shop_id = s.shop_id and sp.sale_id = s.id), '[]'::jsonb),
    'returns', coalesce((
      select jsonb_agg(jsonb_build_object(
               'returnId', r.id, 'createdAt', r.created_at, 'refundPaise', r.refund_paise,
               'refundMethod', r.refund_method, 'reason', r.reason,
               'lines', (select jsonb_agg(jsonb_build_object('lineNo', ri.line_no, 'quantityMilli', ri.quantity_milli,
                                                             'refundPaise', ri.refund_paise) order by ri.line_no)
                           from public.sale_return_items ri where ri.shop_id = r.shop_id and ri.return_id = r.id))
             order by r.created_at, r.id)
        from public.sale_returns r where r.shop_id = s.shop_id and r.sale_id = s.id), '[]'::jsonb),
    'shop', jsonb_build_object(
      'name', sh.name, 'addressLine', sh.address_line, 'city', sh.city, 'pincode', sh.pincode,
      'phone', sh.phone_e164, 'gstin', st.gstin, 'upiVpa', st.upi_vpa)
  )
  from public.sales s
  join public.shops sh on sh.id = s.shop_id
  join public.shop_settings st on st.shop_id = s.shop_id
  left join public.profiles p on p.id = s.created_by
  left join public.profiles vp on vp.id = s.voided_by
  where s.id = p_sale_id;
$$;

-- Partial or full return of a bill. Refund per line is the line's net amount for the returned share; the last
-- return of a line refunds exactly what is left, so refunds of a line never exceed what the customer paid for it.
create or replace function public.create_sale_return(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_op_id uuid;
  v_replay jsonb;
  v_sale public.sales;
  v_device public.shop_devices;
  v_method text;
  v_reason text;
  v_line jsonb;
  v_item record;
  v_returned_qty bigint;
  v_returned_paise bigint;
  v_qty bigint;
  v_refund bigint;
  v_total bigint := 0;
  v_rows jsonb := '[]'::jsonb;
  v_return_id uuid;
  v_move record;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_input"}');
  end if;
  v_shop_id := (p_input ->> 'shopId')::uuid;
  perform private.require_member(v_shop_id, 'sale.return');
  v_op_id := (p_input ->> 'clientOperationId')::uuid;
  v_replay := private.idem_get(v_shop_id, v_op_id, 'create_sale_return', p_input);
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_device from public.shop_devices where shop_id = v_shop_id and id = (p_input ->> 'deviceId')::uuid;
  if v_device.id is null or v_device.status <> 'active' then
    perform private.raise_ds('DS_DEVICE_NOT_REGISTERED');
  end if;
  v_method := p_input ->> 'refundMethod';
  if v_method is null or v_method not in ('cash', 'upi', 'card', 'other') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"refundMethod"}');
  end if;
  v_reason := btrim(p_input ->> 'reason');
  if v_reason is null or char_length(v_reason) not between 3 and 200 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"reason"}');
  end if;
  select * into v_sale from public.sales where shop_id = v_shop_id and id = (p_input ->> 'saleId')::uuid for update;
  if v_sale.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  if v_sale.status = 'voided' then
    perform private.raise_ds('DS_SALE_ALREADY_VOIDED');
  end if;
  if jsonb_typeof(p_input -> 'lines') is distinct from 'array' or jsonb_array_length(p_input -> 'lines') = 0 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"lines"}');
  end if;

  for v_line in select value from jsonb_array_elements(p_input -> 'lines') loop
    select i.*, coalesce(u.allows_fraction, false) as allows_fraction into v_item
      from public.sale_items i
      left join public.units u on u.code = i.unit_code
     where i.sale_id = v_sale.id and i.line_no = (v_line ->> 'lineNo')::smallint;
    if v_item.id is null then
      perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('field', 'lineNo', 'lineNo', v_line -> 'lineNo'));
    end if;
    select coalesce(sum(quantity_milli), 0), coalesce(sum(refund_paise), 0) into v_returned_qty, v_returned_paise
      from public.sale_return_items where sale_id = v_sale.id and line_no = v_item.line_no;
    v_qty := (v_line ->> 'quantityMilli')::bigint;
    if v_qty is null or v_qty < 1 or v_qty > v_item.quantity_milli - v_returned_qty
       or (v_item.kind = 'quick' and v_qty <> v_item.quantity_milli)
       or (v_item.kind = 'product' and not v_item.allows_fraction and v_qty % 1000 <> 0) then
      perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object(
        'field', 'quantityMilli', 'lineNo', v_item.line_no, 'returnableMilli', v_item.quantity_milli - v_returned_qty));
    end if;
    v_refund := case when v_qty = v_item.quantity_milli - v_returned_qty
                     then v_item.net_paise - v_returned_paise
                     else private.round_half_up_div(v_item.net_paise::numeric * v_qty, v_item.quantity_milli) end;
    v_total := v_total + v_refund;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'lineNo', v_item.line_no, 'quantityMilli', v_qty, 'refundPaise', v_refund, 'productId', v_item.product_id));
  end loop;
  if (select count(distinct r ->> 'lineNo') from jsonb_array_elements(v_rows) r) <> jsonb_array_length(v_rows) then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"lines","reason":"duplicate_line"}');
  end if;

  insert into public.sale_returns (shop_id, sale_id, device_id, business_date, refund_method, refund_paise, reason,
                                   client_operation_id, created_by)
  values (v_shop_id, v_sale.id, v_device.id, private.shop_today(v_shop_id), v_method, v_total, v_reason, v_op_id, auth.uid())
  returning id into v_return_id;
  insert into public.sale_return_items (shop_id, return_id, sale_id, line_no, quantity_milli, refund_paise)
  select v_shop_id, v_return_id, v_sale.id, (r ->> 'lineNo')::smallint, (r ->> 'quantityMilli')::bigint,
         (r ->> 'refundPaise')::bigint
    from jsonb_array_elements(v_rows) r;

  -- Stock comes back only for products whose sale moved stock.
  for v_move in
    select (r ->> 'productId')::uuid as product_id, sum((r ->> 'quantityMilli')::bigint) as qty
      from jsonb_array_elements(v_rows) r
     where r ->> 'productId' is not null
       and exists (select 1 from public.stock_movements m
                    where m.shop_id = v_shop_id and m.sale_id = v_sale.id and m.kind = 'sale'
                      and m.product_id = (r ->> 'productId')::uuid)
     group by 1
     order by 1
  loop
    perform 1 from public.products where shop_id = v_shop_id and id = v_move.product_id for update;
    insert into public.stock_movements (shop_id, product_id, kind, quantity_milli, sale_id, return_id, created_by)
    values (v_shop_id, v_move.product_id, 'sale_return', v_move.qty, v_sale.id, v_return_id, auth.uid());
    update public.products set stock_on_hand_milli = stock_on_hand_milli + v_move.qty
     where shop_id = v_shop_id and id = v_move.product_id;
  end loop;

  perform private.write_audit('shop_user', 'sale.returned', v_shop_id, 'sale', v_sale.id::text, null,
    jsonb_build_object('returnId', v_return_id, 'refundPaise', v_total, 'refundMethod', v_method,
                       'invoiceNumber', v_sale.invoice_number), v_reason);

  return private.idem_put(v_shop_id, v_op_id, 'create_sale_return', p_input, jsonb_build_object(
    'returnId', v_return_id, 'saleId', v_sale.id, 'refundPaise', v_total, 'refundMethod', v_method));
end;
$$;

-- ===========================================================================
-- 3. Expenses
-- ===========================================================================
create table public.expenses (
  id uuid primary key,                      -- client-generated, so the attachment can be uploaded first
  shop_id uuid not null references public.shops (id) on delete cascade,
  device_id uuid,
  business_date date not null,
  category text not null check (category in ('rent', 'salary', 'electricity', 'transport', 'supplies', 'tea_snacks',
                                             'repairs', 'other')),
  amount_paise bigint not null check (amount_paise between 1 and 100000000),
  method text not null check (method in ('cash', 'upi', 'card', 'other')),
  note text check (note is null or char_length(note) <= 200),
  attachment_path text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id),
  void_reason text check (void_reason is null or char_length(void_reason) between 3 and 200),
  unique (shop_id, id),
  foreign key (shop_id, device_id) references public.shop_devices (shop_id, id),
  check (attachment_path is null or attachment_path like shop_id::text || '/' || id::text || '/%'),
  check ((voided_at is null) = (voided_by is null))
);
create index expenses_shop_date on public.expenses (shop_id, business_date);
create index expenses_created_by on public.expenses (created_by);
create index expenses_voided_by on public.expenses (voided_by);

alter table public.expenses enable row level security;
create policy expenses_select on public.expenses for select to authenticated
  using ((select rls.has_permission(shop_id, 'expense.view')));
grant select on public.expenses to authenticated;

create or replace function private.expense_json(p_expense public.expenses)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_expense.id, 'businessDate', p_expense.business_date, 'category', p_expense.category,
    'amountPaise', p_expense.amount_paise, 'method', p_expense.method, 'note', p_expense.note,
    'attachmentPath', p_expense.attachment_path, 'createdAt', p_expense.created_at,
    'voidedAt', p_expense.voided_at, 'voidReason', p_expense.void_reason);
$$;

create or replace function public.record_expense(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_id uuid;
  v_existing public.expenses;
  v_row public.expenses;
  v_date date;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_input"}');
  end if;
  v_shop_id := (p_input ->> 'shopId')::uuid;
  perform private.require_member(v_shop_id, 'expense.create');
  v_id := (p_input ->> 'id')::uuid;
  if v_id is null then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"id"}');
  end if;
  -- The id is the idempotency key: a retried save returns the same expense.
  select * into v_existing from public.expenses where id = v_id;
  if v_existing.id is not null then
    if v_existing.shop_id <> v_shop_id then
      perform private.raise_ds('DS_CONFLICT');
    end if;
    return private.expense_json(v_existing) || '{"replayed": true}'::jsonb;
  end if;

  v_date := coalesce((p_input ->> 'businessDate')::date, private.shop_today(v_shop_id));
  if v_date > private.shop_today(v_shop_id) or v_date < private.shop_today(v_shop_id) - 31 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"businessDate"}');
  end if;
  if p_input ->> 'deviceId' is not null
     and not exists (select 1 from public.shop_devices where shop_id = v_shop_id and id = (p_input ->> 'deviceId')::uuid) then
    perform private.raise_ds('DS_DEVICE_NOT_REGISTERED');
  end if;
  begin
    insert into public.expenses (id, shop_id, device_id, business_date, category, amount_paise, method, note,
                                 attachment_path, created_by)
    values (v_id, v_shop_id, (p_input ->> 'deviceId')::uuid, v_date, p_input ->> 'category',
            (p_input ->> 'amountPaise')::bigint, p_input ->> 'method', nullif(btrim(p_input ->> 'note'), ''),
            nullif(p_input ->> 'attachmentPath', ''), auth.uid())
    returning * into v_row;
  exception when check_violation or not_null_violation then
    perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('reason', sqlerrm));
  end;
  perform private.write_audit('shop_user', 'expense.recorded', v_shop_id, 'expense', v_id::text, null,
    private.expense_json(v_row));
  return private.expense_json(v_row) || '{"replayed": false}'::jsonb;
end;
$$;

-- Owner only; the expense stays with a reason.
create or replace function public.void_expense(p_shop_id uuid, p_expense_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_row public.expenses;
begin
  v_role := private.require_member(p_shop_id, 'expense.create');
  if v_role <> 'owner' then
    perform private.raise_ds('DS_PERMISSION_DENIED', '{"reason":"owner_only"}');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 200 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"reason"}');
  end if;
  update public.expenses
     set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where shop_id = p_shop_id and id = p_expense_id and voided_at is null
  returning * into v_row;
  if v_row.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  perform private.write_audit('shop_user', 'expense.voided', p_shop_id, 'expense', p_expense_id::text, null,
    private.expense_json(v_row), btrim(p_reason));
  return private.expense_json(v_row);
end;
$$;

-- Private bucket for receipt photos: objects live under "<shop_id>/<expense_id>/...".
create or replace function rls.shop_of_path(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end;
$$;
revoke execute on function rls.shop_of_path(text) from public, anon;
grant execute on function rls.shop_of_path(text) to authenticated;

do $$
begin
  if to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('expense-attachments', 'expense-attachments', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    execute $p$create policy expense_attachments_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'expense-attachments'
                  and (select rls.has_permission(rls.shop_of_path(name), 'expense.create')))$p$;
    execute $p$create policy expense_attachments_select on storage.objects for select to authenticated
      using (bucket_id = 'expense-attachments'
             and (select rls.has_permission(rls.shop_of_path(name), 'expense.view')))$p$;
  end if;
end;
$$;

-- ===========================================================================
-- 4. Day close
-- ===========================================================================
create table public.day_closures (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  device_id uuid not null,
  business_date date not null,
  opening_cash_paise bigint not null check (opening_cash_paise >= 0),
  expected_cash_paise bigint not null,
  counted_cash_paise bigint not null check (counted_cash_paise >= 0),
  difference_paise bigint not null,
  breakdown jsonb not null,
  note text check (note is null or char_length(note) <= 200),
  client_operation_id uuid not null,
  closed_by uuid not null references auth.users (id),
  closed_at timestamptz not null default now(),
  unique (shop_id, device_id, business_date),
  foreign key (shop_id, device_id) references public.shop_devices (shop_id, id),
  check (difference_paise = counted_cash_paise - expected_cash_paise)
);
create index day_closures_closed_by on public.day_closures (closed_by);
alter table public.day_closures enable row level security;
create policy day_closures_select on public.day_closures for select to authenticated
  using ((select rls.has_permission(shop_id, 'report.view_sales')) or closed_by = (select auth.uid()));
grant select on public.day_closures to authenticated;

-- Cash that should be in this phone's drawer for a date (features/reports-expenses-dayclose.md "Expected cash").
-- Udhaar repayments and supplier payments join in Phases 07–08.
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
       and e.voided_at is null and e.method = 'cash')
  select jsonb_build_object(
    'openingCashPaise', p_opening,
    'cashSalesPaise', (select v from cash_sales),
    'cashRefundsPaise', (select v from cash_refunds),
    'cashExpensesPaise', (select v from cash_expenses),
    'expectedCashPaise', p_opening + (select v from cash_sales) - (select v from cash_refunds) - (select v from cash_expenses));
$$;

create or replace function public.get_day_close(p_shop_id uuid, p_device_id uuid, p_business_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_date date;
  v_closed public.day_closures;
begin
  perform private.require_member(p_shop_id, 'day.close');
  v_date := coalesce(p_business_date, private.shop_today(p_shop_id));
  if not exists (select 1 from public.shop_devices where shop_id = p_shop_id and id = p_device_id) then
    perform private.raise_ds('DS_DEVICE_NOT_REGISTERED');
  end if;
  select * into v_closed from public.day_closures
   where shop_id = p_shop_id and device_id = p_device_id and business_date = v_date;
  return jsonb_build_object(
    'businessDate', v_date,
    'closed', v_closed.id is not null,
    'breakdown', coalesce(v_closed.breakdown, private.cash_breakdown(p_shop_id, p_device_id, v_date, 0)),
    'countedCashPaise', v_closed.counted_cash_paise,
    'differencePaise', v_closed.difference_paise,
    'closedAt', v_closed.closed_at,
    'note', v_closed.note);
end;
$$;

create or replace function public.close_day(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_op_id uuid;
  v_replay jsonb;
  v_device_id uuid;
  v_date date;
  v_opening bigint;
  v_counted bigint;
  v_breakdown jsonb;
  v_row public.day_closures;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_input"}');
  end if;
  v_shop_id := (p_input ->> 'shopId')::uuid;
  perform private.require_member(v_shop_id, 'day.close');
  v_op_id := (p_input ->> 'clientOperationId')::uuid;
  v_replay := private.idem_get(v_shop_id, v_op_id, 'close_day', p_input);
  if v_replay is not null then
    return v_replay;
  end if;
  v_device_id := (p_input ->> 'deviceId')::uuid;
  if not exists (select 1 from public.shop_devices where shop_id = v_shop_id and id = v_device_id and status = 'active') then
    perform private.raise_ds('DS_DEVICE_NOT_REGISTERED');
  end if;
  v_date := coalesce((p_input ->> 'businessDate')::date, private.shop_today(v_shop_id));
  if v_date > private.shop_today(v_shop_id) or v_date < private.shop_today(v_shop_id) - 7 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"businessDate"}');
  end if;
  v_opening := coalesce((p_input ->> 'openingCashPaise')::bigint, 0);
  v_counted := (p_input ->> 'countedCashPaise')::bigint;
  if v_opening < 0 or v_counted is null or v_counted < 0 or char_length(p_input ->> 'note') > 200 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"cash"}');
  end if;
  if exists (select 1 from public.day_closures where shop_id = v_shop_id and device_id = v_device_id and business_date = v_date) then
    perform private.raise_ds('DS_CONFLICT', '{"reason":"already_closed"}');
  end if;

  v_breakdown := private.cash_breakdown(v_shop_id, v_device_id, v_date, v_opening);
  insert into public.day_closures (shop_id, device_id, business_date, opening_cash_paise, expected_cash_paise,
                                   counted_cash_paise, difference_paise, breakdown, note, client_operation_id, closed_by)
  values (v_shop_id, v_device_id, v_date, v_opening, (v_breakdown ->> 'expectedCashPaise')::bigint, v_counted,
          v_counted - (v_breakdown ->> 'expectedCashPaise')::bigint, v_breakdown, nullif(btrim(p_input ->> 'note'), ''),
          v_op_id, auth.uid())
  returning * into v_row;
  perform private.write_audit('shop_user', 'day.closed', v_shop_id, 'day_closure', v_row.id::text, null,
    jsonb_build_object('businessDate', v_date, 'expectedCashPaise', v_row.expected_cash_paise,
                       'countedCashPaise', v_counted, 'differencePaise', v_row.difference_paise));

  return private.idem_put(v_shop_id, v_op_id, 'close_day', p_input, jsonb_build_object(
    'businessDate', v_date, 'closed', true, 'breakdown', v_breakdown, 'countedCashPaise', v_counted,
    'differencePaise', v_row.difference_paise, 'closedAt', v_row.closed_at, 'note', v_row.note));
end;
$$;

-- ===========================================================================
-- 5. Dashboard and sales report
-- ===========================================================================
-- Estimated gross profit of non-voided sales lines in a date range: net − cost × qty for lines with a known cost.
create or replace function private.profit_estimate(p_shop_id uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'profitPaise', coalesce(sum(i.net_paise - private.round_half_up_div(i.unit_cost_paise::numeric * i.quantity_milli, 1000))
                     filter (where i.unit_cost_paise is not null), 0),
    'linesWithCost', count(*) filter (where i.unit_cost_paise is not null),
    'lines', count(*))
  from public.sales s join public.sale_items i on i.shop_id = s.shop_id and i.sale_id = s.id
  where s.shop_id = p_shop_id and s.business_date between p_from and p_to and s.status <> 'voided';
$$;

create or replace function public.get_dashboard_snapshot(p_shop_id uuid, p_business_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_date date;
  v_sales jsonb;
  v_result jsonb;
begin
  v_role := private.require_member(p_shop_id);
  v_date := coalesce(p_business_date, private.shop_today(p_shop_id));

  if not exists (select 1 from public.role_permissions where role = v_role and permission = 'report.view_sales') then
    -- Cashiers: only their own bills of the day.
    return jsonb_build_object('businessDate', v_date, 'scope', 'own',
      'salesPaise', (select coalesce(sum(total_paise), 0) from public.sales
                      where shop_id = p_shop_id and business_date = v_date and status <> 'voided' and created_by = auth.uid()),
      'bills', (select count(*) from public.sales
                 where shop_id = p_shop_id and business_date = v_date and status <> 'voided' and created_by = auth.uid()));
  end if;

  select jsonb_build_object(
           'salesPaise', coalesce(sum(total_paise) filter (where status <> 'voided'), 0),
           'bills', count(*) filter (where status <> 'voided'),
           'voidedBills', count(*) filter (where status = 'voided'),
           'discountPaise', coalesce(sum(discount_paise) filter (where status <> 'voided'), 0),
           'taxPaise', coalesce(sum(tax_paise) filter (where status <> 'voided'), 0),
           'udhaarGivenPaise', coalesce(sum(udhaar_paise) filter (where status <> 'voided'), 0))
    into v_sales
    from public.sales where shop_id = p_shop_id and business_date = v_date;

  v_result := v_sales || jsonb_build_object(
    'businessDate', v_date,
    'scope', 'shop',
    'returnsPaise', (select coalesce(sum(refund_paise), 0) from public.sale_returns
                      where shop_id = p_shop_id and business_date = v_date),
    'expensesPaise', (select coalesce(sum(amount_paise), 0) from public.expenses
                       where shop_id = p_shop_id and business_date = v_date and voided_at is null),
    'payments', (select coalesce(jsonb_object_agg(method, amount), '{}'::jsonb) from (
                   select sp.method, sum(sp.amount_paise) as amount
                     from public.sales s join public.sale_payments sp on sp.shop_id = s.shop_id and sp.sale_id = s.id
                    where s.shop_id = p_shop_id and s.business_date = v_date and s.status <> 'voided'
                    group by sp.method) m),
    'refunds', (select coalesce(jsonb_object_agg(refund_method, amount), '{}'::jsonb) from (
                  select refund_method, sum(refund_paise) as amount from public.sale_returns
                   where shop_id = p_shop_id and business_date = v_date group by refund_method) r));
  v_result := v_result || jsonb_build_object('netSalesPaise',
    (v_result ->> 'salesPaise')::bigint - (v_result ->> 'returnsPaise')::bigint);
  if exists (select 1 from public.role_permissions where role = v_role and permission = 'report.view_profit') then
    v_result := v_result || jsonb_build_object('profit', private.profit_estimate(p_shop_id, v_date, v_date));
  end if;
  return v_result;
end;
$$;

-- Sales report. Longer than 7 days or broken down by product / category / staff needs reports.advanced.
create or replace function public.get_sales_report(p_shop_id uuid, p_from date, p_to date, p_group_by text default 'day')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_profit boolean;
  v_rows jsonb;
begin
  v_role := private.require_member(p_shop_id, 'report.view_sales');
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366
     or p_group_by not in ('day', 'payment', 'product', 'category', 'staff') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"range"}');
  end if;
  if p_to - p_from > 6 or p_group_by in ('product', 'category', 'staff') then
    perform private.assert_entitlement(p_shop_id, 'reports.advanced');
  end if;
  v_profit := exists (select 1 from public.role_permissions where role = v_role and permission = 'report.view_profit');

  if p_group_by = 'day' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', d::date, 'label', to_char(d, 'YYYY-MM-DD'),
             'salesPaise', coalesce(s.sales, 0), 'bills', coalesce(s.bills, 0),
             'returnsPaise', coalesce(r.returns, 0), 'netPaise', coalesce(s.sales, 0) - coalesce(r.returns, 0))
             || case when v_profit then jsonb_build_object('profitPaise',
                  (private.profit_estimate(p_shop_id, d::date, d::date) ->> 'profitPaise')::bigint) else '{}'::jsonb end
           order by d), '[]'::jsonb)
      into v_rows
      from generate_series(p_from, p_to, interval '1 day') d
      left join (select business_date, sum(total_paise) as sales, count(*) as bills from public.sales
                  where shop_id = p_shop_id and business_date between p_from and p_to and status <> 'voided'
                  group by business_date) s on s.business_date = d::date
      left join (select business_date, sum(refund_paise) as returns from public.sale_returns
                  where shop_id = p_shop_id and business_date between p_from and p_to
                  group by business_date) r on r.business_date = d::date;
  elsif p_group_by = 'payment' then
    select coalesce(jsonb_agg(jsonb_build_object('key', method, 'label', method, 'salesPaise', amount) order by amount desc), '[]'::jsonb)
      into v_rows
      from (select sp.method, sum(sp.amount_paise) as amount
              from public.sales s join public.sale_payments sp on sp.shop_id = s.shop_id and sp.sale_id = s.id
             where s.shop_id = p_shop_id and s.business_date between p_from and p_to and s.status <> 'voided'
             group by sp.method) m;
  elsif p_group_by in ('product', 'category') then
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', key, 'label', label, 'salesPaise', amount, 'quantityMilli', qty, 'bills', bills)
             || case when v_profit then jsonb_build_object('profitPaise', profit) else '{}'::jsonb end
           order by amount desc), '[]'::jsonb)
      into v_rows
      from (select case when p_group_by = 'product' then coalesce(i.product_id::text, 'quick')
                        else coalesce(p.category_id::text, 'none') end as key,
                   case when p_group_by = 'product' then coalesce(max(i.label) filter (where i.product_id is not null), 'quick')
                        else coalesce(max(c.name), 'none') end as label,
                   sum(i.net_paise) as amount,
                   sum(i.quantity_milli) filter (where i.product_id is not null) as qty,
                   count(distinct s.id) as bills,
                   coalesce(sum(i.net_paise - private.round_half_up_div(i.unit_cost_paise::numeric * i.quantity_milli, 1000))
                              filter (where i.unit_cost_paise is not null), 0) as profit
              from public.sales s
              join public.sale_items i on i.shop_id = s.shop_id and i.sale_id = s.id
              left join public.products p on p.shop_id = i.shop_id and p.id = i.product_id
              left join public.categories c on c.shop_id = p.shop_id and c.id = p.category_id
             where s.shop_id = p_shop_id and s.business_date between p_from and p_to and s.status <> 'voided'
             group by 1) g;
  else -- staff
    select coalesce(jsonb_agg(jsonb_build_object('key', created_by, 'label', coalesce(name, '—'),
                                                 'salesPaise', amount, 'bills', bills) order by amount desc), '[]'::jsonb)
      into v_rows
      from (select s.created_by, max(pr.display_name) as name, sum(s.total_paise) as amount, count(*) as bills
              from public.sales s left join public.profiles pr on pr.id = s.created_by
             where s.shop_id = p_shop_id and s.business_date between p_from and p_to and s.status <> 'voided'
             group by s.created_by) g;
  end if;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'groupBy', p_group_by, 'rows', v_rows,
    'totals', jsonb_build_object(
      'salesPaise', (select coalesce(sum(total_paise), 0) from public.sales
                      where shop_id = p_shop_id and business_date between p_from and p_to and status <> 'voided'),
      'bills', (select count(*) from public.sales
                 where shop_id = p_shop_id and business_date between p_from and p_to and status <> 'voided'),
      'returnsPaise', (select coalesce(sum(refund_paise), 0) from public.sale_returns
                        where shop_id = p_shop_id and business_date between p_from and p_to),
      'expensesPaise', (select coalesce(sum(amount_paise), 0) from public.expenses
                         where shop_id = p_shop_id and business_date between p_from and p_to and voided_at is null))
    || case when v_profit then jsonb_build_object('profit', private.profit_estimate(p_shop_id, p_from, p_to)) else '{}'::jsonb end
  );
end;
$$;

-- ===========================================================================
-- 6. Export quota (the CSV itself is built on the phone from the report it already shows)
-- ===========================================================================
create table public.report_exports (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  kind text not null check (kind in ('sales_report')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index report_exports_shop on public.report_exports (shop_id, created_at desc);
create index report_exports_created_by on public.report_exports (created_by);
alter table public.report_exports enable row level security;

create or replace function public.begin_report_export(p_shop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used bigint;
  v_limit jsonb;
begin
  perform private.require_member(p_shop_id, 'report.export');
  perform private.assert_entitlement(p_shop_id, 'reports.export');
  select count(*) into v_used from public.report_exports
   where shop_id = p_shop_id and created_at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  perform private.assert_quota(p_shop_id, 'exports.monthly', v_used);
  insert into public.report_exports (shop_id, kind, created_by) values (p_shop_id, 'sales_report', auth.uid());
  v_limit := private.resolve_entitlements(p_shop_id) -> 'exports.monthly';
  return jsonb_build_object('used', v_used + 1,
    'limit', case when jsonb_typeof(v_limit) = 'null' then null else (v_limit #>> '{}')::bigint end);
end;
$$;

revoke execute on function private.set_sale_business_date() from public, anon, authenticated;
revoke execute on function private.shop_today(uuid) from public, anon, authenticated;
revoke execute on function private.expense_json(public.expenses) from public, anon, authenticated;
revoke execute on function private.cash_breakdown(uuid, uuid, date, bigint) from public, anon, authenticated;
revoke execute on function private.profit_estimate(uuid, date, date) from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_sale_return(jsonb)',
    'public.record_expense(jsonb)',
    'public.void_expense(uuid, uuid, text)',
    'public.get_day_close(uuid, uuid, date)',
    'public.close_day(jsonb)',
    'public.get_dashboard_snapshot(uuid, date)',
    'public.get_sales_report(uuid, date, date, text)',
    'public.begin_report_export(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
