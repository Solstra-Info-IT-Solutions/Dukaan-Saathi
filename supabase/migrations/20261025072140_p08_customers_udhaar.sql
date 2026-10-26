-- Phase 08: customers, udhaar (credit) and the customer ledger.
-- Balance convention: + = the customer owes the shop, − = the shop owes the customer (advance).

-- ===========================================================================
-- 1. Customers and their ledger
-- ===========================================================================
create table public.customers (
  id uuid primary key,                         -- client-generated, so creating twice is safe
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+91[6-9][0-9]{9}$'),
  note text check (note is null or char_length(note) <= 200),
  credit_limit_paise bigint check (credit_limit_paise is null or credit_limit_paise between 0 and 100000000),
  balance_paise bigint not null default 0,
  udhaar_since timestamptz,                    -- when the balance last went from ≤ 0 to > 0 ("oldest" sort)
  last_activity_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id),
  check (archived_at is null or balance_paise = 0)
);
create unique index customers_shop_phone on public.customers (shop_id, phone_e164)
  where archived_at is null and phone_e164 is not null;
create index customers_shop_name on public.customers (shop_id, lower(name));
create index customers_shop_balance on public.customers (shop_id, balance_paise desc) where balance_paise <> 0;
create index customers_created_by on public.customers (created_by);
create trigger customers_updated_at before update on public.customers
  for each row execute function private.set_updated_at();

alter table public.sales add constraint sales_customer_fk
  foreign key (shop_id, customer_id) references public.customers (shop_id, id);
alter table public.sales add constraint sales_udhaar_needs_customer check (udhaar_paise = 0 or customer_id is not null);
create index sales_customer on public.sales (shop_id, customer_id) where customer_id is not null;

-- Returns of a credit bill can go back to the customer's account instead of paying out money.
alter table public.sale_returns drop constraint sale_returns_refund_method_check;
alter table public.sale_returns add constraint sale_returns_refund_method_check
  check (refund_method in ('cash', 'upi', 'card', 'other', 'udhaar'));

create table public.customer_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,       -- exact order, also within one transaction
  shop_id uuid not null,
  customer_id uuid not null,
  kind text not null check (kind in ('opening', 'sale', 'repayment', 'sale_void', 'sale_return', 'adjustment')),
  amount_paise bigint not null check (amount_paise <> 0),
  balance_after_paise bigint not null,
  method text check (method is null or method in ('cash', 'upi', 'card', 'other')),
  sale_id uuid,
  return_id uuid,
  device_id uuid,
  business_date date not null,
  note text check (note is null or char_length(note) <= 200),
  client_operation_id uuid,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (shop_id, customer_id) references public.customers (shop_id, id),
  foreign key (shop_id, sale_id) references public.sales (shop_id, id),
  foreign key (shop_id, return_id) references public.sale_returns (shop_id, id),
  foreign key (shop_id, device_id) references public.shop_devices (shop_id, id),
  check ((kind = 'repayment') = (method is not null)),
  check (kind not in ('repayment', 'sale_void', 'sale_return') or amount_paise < 0),
  check (kind <> 'sale' or amount_paise > 0),
  check ((kind in ('sale', 'sale_void', 'sale_return')) = (sale_id is not null)),
  check ((kind = 'sale_return') = (return_id is not null)),
  check (kind <> 'adjustment' or char_length(note) >= 3)
);
create index customer_ledger_customer on public.customer_ledger_entries (shop_id, customer_id, seq desc);
create index customer_ledger_date on public.customer_ledger_entries (shop_id, business_date);
create index customer_ledger_sale on public.customer_ledger_entries (shop_id, sale_id) where sale_id is not null;
create index customer_ledger_return on public.customer_ledger_entries (shop_id, return_id) where return_id is not null;
create index customer_ledger_device on public.customer_ledger_entries (shop_id, device_id) where device_id is not null;
create index customer_ledger_created_by on public.customer_ledger_entries (created_by);

alter table public.customers enable row level security;
alter table public.customer_ledger_entries enable row level security;
create policy customers_select on public.customers for select to authenticated
  using ((select rls.has_permission(shop_id, 'customer.view')));
create policy customer_ledger_select on public.customer_ledger_entries for select to authenticated
  using ((select rls.has_permission(shop_id, 'customer.view')));
grant select on public.customers, public.customer_ledger_entries to authenticated;

-- Adds a ledger entry and keeps customers.balance_paise equal to the sum of entries (same transaction).
-- The caller has locked the customer row. Returns the new balance.
create or replace function private.add_customer_entry(p_shop_id uuid, p_customer_id uuid, p_kind text, p_amount bigint,
                                                      p_method text, p_sale_id uuid, p_return_id uuid, p_device_id uuid,
                                                      p_note text, p_op_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
begin
  update public.customers
     set balance_paise = balance_paise + p_amount,
         udhaar_since = case when balance_paise + p_amount <= 0 then null
                             when balance_paise <= 0 then now()
                             else udhaar_since end,
         last_activity_at = now()
   where shop_id = p_shop_id and id = p_customer_id
  returning balance_paise into v_balance;
  if v_balance is null then
    perform private.raise_ds('DS_NOT_FOUND', '{"entity":"customer"}');
  end if;
  insert into public.customer_ledger_entries (shop_id, customer_id, kind, amount_paise, balance_after_paise, method, sale_id,
                                              return_id, device_id, business_date, note, client_operation_id, created_by)
  values (p_shop_id, p_customer_id, p_kind, p_amount, v_balance, p_method, p_sale_id, p_return_id, p_device_id,
          private.shop_today(p_shop_id), p_note, p_op_id, auth.uid());
  return v_balance;
end;
$$;

create or replace function private.customer_json(p_customer public.customers)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_customer.id, 'name', p_customer.name, 'phone', p_customer.phone_e164, 'note', p_customer.note,
    'creditLimitPaise', p_customer.credit_limit_paise, 'balancePaise', p_customer.balance_paise,
    'udhaarSince', p_customer.udhaar_since, 'lastActivityAt', p_customer.last_activity_at,
    'archivedAt', p_customer.archived_at, 'createdAt', p_customer.created_at);
$$;

-- ===========================================================================
-- 2. Customer RPCs
-- ===========================================================================
-- Creates or edits a customer (client id). Cashiers may quick-create (name + phone) from billing; the opening balance
-- and credit limit need customer.manage. The opening balance is accepted only when the customer is created.
create or replace function public.save_customer(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_role text;
  v_id uuid;
  v_manage boolean;
  v_existing public.customers;
  v_row public.customers;
  v_opening bigint;
  v_limit bigint;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_input"}');
  end if;
  v_shop_id := (p_input ->> 'shopId')::uuid;
  v_role := private.require_member(v_shop_id);
  v_manage := exists (select 1 from public.role_permissions where role = v_role and permission = 'customer.manage');
  v_id := (p_input ->> 'id')::uuid;
  if v_id is null then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"id"}');
  end if;
  select * into v_existing from public.customers where id = v_id;
  if v_existing.id is not null and v_existing.shop_id <> v_shop_id then
    perform private.raise_ds('DS_CONFLICT');
  end if;
  v_opening := coalesce((p_input ->> 'openingBalancePaise')::bigint, 0);
  v_limit := (p_input ->> 'creditLimitPaise')::bigint;
  if v_opening not between -100000000 and 100000000 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"openingBalancePaise"}');
  end if;
  if not v_manage then
    if v_existing.id is not null then
      perform private.raise_ds('DS_PERMISSION_DENIED', '{"permission":"customer.manage"}');
    end if;
    if not exists (select 1 from public.role_permissions where role = v_role and permission = 'customer.quick_create') then
      perform private.raise_ds('DS_PERMISSION_DENIED', '{"permission":"customer.quick_create"}');
    end if;
    if v_opening <> 0 or v_limit is not null then
      perform private.raise_ds('DS_PERMISSION_DENIED', '{"permission":"customer.manage"}');
    end if;
  end if;

  begin
    if v_existing.id is null then
      perform private.assert_quota(v_shop_id, 'customers.max',
        (select count(*) from public.customers where shop_id = v_shop_id and archived_at is null));
      insert into public.customers (id, shop_id, name, phone_e164, note, credit_limit_paise, created_by)
      values (v_id, v_shop_id, btrim(p_input ->> 'name'), nullif(p_input ->> 'phone', ''),
              nullif(btrim(p_input ->> 'note'), ''), v_limit, auth.uid())
      returning * into v_row;
      if v_opening <> 0 then
        perform private.add_customer_entry(v_shop_id, v_id, 'opening', v_opening, null, null, null, null,
                                           'Opening balance', null);
      end if;
      perform private.write_audit('shop_user', 'customer.created', v_shop_id, 'customer', v_id::text, null,
        jsonb_build_object('openingBalancePaise', v_opening));
    else
      update public.customers
         set name = btrim(p_input ->> 'name'), phone_e164 = nullif(p_input ->> 'phone', ''),
             note = nullif(btrim(p_input ->> 'note'), ''), credit_limit_paise = v_limit
       where id = v_id
      returning * into v_row;
    end if;
  exception
    when unique_violation then
      perform private.raise_ds('DS_CONFLICT', '{"field":"phone"}');
    when check_violation or not_null_violation then
      perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('reason', sqlerrm));
  end;
  select * into v_row from public.customers where id = v_id;
  return private.customer_json(v_row);
end;
$$;

-- A customer can be archived only when nothing is owed either way.
create or replace function public.archive_customer(p_shop_id uuid, p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.customers;
begin
  perform private.require_member(p_shop_id, 'customer.manage');
  select * into v_row from public.customers where shop_id = p_shop_id and id = p_customer_id for update;
  if v_row.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  if v_row.balance_paise <> 0 then
    perform private.raise_ds('DS_CONFLICT', jsonb_build_object('reason', 'balance_not_zero', 'balancePaise', v_row.balance_paise));
  end if;
  update public.customers set archived_at = coalesce(archived_at, now()) where id = v_row.id returning * into v_row;
  perform private.write_audit('shop_user', 'customer.archived', p_shop_id, 'customer', v_row.id::text, null, null);
  return private.customer_json(v_row);
end;
$$;

-- Customers by name / phone. p_sort: name | highest (balance) | oldest (udhaar since). p_udhaar_only: balance > 0.
-- Totals cover the whole shop, not just the page.
create or replace function public.list_customers(p_shop_id uuid, p_query text default null, p_sort text default 'name',
                                                 p_udhaar_only boolean default false, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(lower(btrim(p_query)), '');
  v_digits text := nullif(regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g'), '');
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  perform private.require_member(p_shop_id, 'customer.view');
  if p_sort not in ('name', 'highest', 'oldest') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"sort"}');
  end if;
  return jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(private.customer_json(c) order by
               case when p_sort = 'highest' then -c.balance_paise end,
               case when p_sort = 'oldest' then c.udhaar_since end nulls last,
               lower(c.name), c.id)
        from (select f.id from public.customers f
               where f.shop_id = p_shop_id and f.archived_at is null
                 and (not coalesce(p_udhaar_only, false) or f.balance_paise > 0)
                 and (v_q is null or lower(f.name) like '%' || v_q || '%'
                      or (v_digits is not null and f.phone_e164 like '%' || v_digits || '%'))
               order by case when p_sort = 'highest' then -f.balance_paise end,
                        case when p_sort = 'oldest' then f.udhaar_since end nulls last,
                        lower(f.name), f.id
               limit v_limit) page
        join public.customers c on c.id = page.id), '[]'::jsonb),
    'totalOutstandingPaise', (select coalesce(sum(balance_paise), 0) from public.customers
                               where shop_id = p_shop_id and archived_at is null and balance_paise > 0),
    'customersWithUdhaar', (select count(*) from public.customers
                             where shop_id = p_shop_id and archived_at is null and balance_paise > 0));
end;
$$;

-- The customer and their entries, newest first, each with the balance after it.
create or replace function public.get_customer_ledger(p_shop_id uuid, p_customer_id uuid, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.customers;
begin
  perform private.require_member(p_shop_id, 'customer.view');
  select * into v_row from public.customers where shop_id = p_shop_id and id = p_customer_id;
  if v_row.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  return jsonb_build_object(
    'customer', private.customer_json(v_row),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'kind', e.kind, 'amountPaise', e.amount_paise, 'balanceAfterPaise', e.balance_after_paise,
               'method', e.method, 'saleId', e.sale_id, 'invoiceNumber', s.invoice_number, 'note', e.note,
               'businessDate', e.business_date, 'createdAt', e.created_at, 'createdByName', p.display_name)
             order by e.seq desc)
        from (select * from public.customer_ledger_entries
               where shop_id = p_shop_id and customer_id = p_customer_id
               order by seq desc
               limit least(greatest(coalesce(p_limit, 100), 1), 500)) e
        left join public.sales s on s.shop_id = e.shop_id and s.id = e.sale_id
        left join public.profiles p on p.id = e.created_by), '[]'::jsonb));
end;
$$;

-- Money received against udhaar. Overpaying is allowed: the balance goes negative (advance).
create or replace function public.record_customer_repayment(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_op_id uuid;
  v_replay jsonb;
  v_customer public.customers;
  v_amount bigint;
  v_device_id uuid;
  v_balance bigint;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_input"}');
  end if;
  v_shop_id := (p_input ->> 'shopId')::uuid;
  perform private.require_member(v_shop_id, 'udhaar.collect');
  v_op_id := (p_input ->> 'clientOperationId')::uuid;
  v_replay := private.idem_get(v_shop_id, v_op_id, 'record_customer_repayment', p_input);
  if v_replay is not null then
    return v_replay;
  end if;
  select * into v_customer from public.customers
   where shop_id = v_shop_id and id = (p_input ->> 'customerId')::uuid for update;
  if v_customer.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  v_amount := (p_input ->> 'amountPaise')::bigint;
  if v_amount is null or v_amount < 1 or v_amount > 100000000
     or p_input ->> 'method' is null or p_input ->> 'method' not in ('cash', 'upi', 'card', 'other')
     or char_length(p_input ->> 'note') > 200 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"repayment"}');
  end if;
  v_device_id := (p_input ->> 'deviceId')::uuid;
  if v_device_id is not null
     and not exists (select 1 from public.shop_devices where shop_id = v_shop_id and id = v_device_id and status = 'active') then
    perform private.raise_ds('DS_DEVICE_NOT_REGISTERED');
  end if;
  v_balance := private.add_customer_entry(v_shop_id, v_customer.id, 'repayment', -v_amount, p_input ->> 'method', null, null,
                                          v_device_id, nullif(btrim(p_input ->> 'note'), ''), v_op_id);
  perform private.write_audit('shop_user', 'udhaar.collected', v_shop_id, 'customer', v_customer.id::text, null,
    jsonb_build_object('amountPaise', v_amount, 'method', p_input ->> 'method', 'balancePaise', v_balance));
  return private.idem_put(v_shop_id, v_op_id, 'record_customer_repayment', p_input,
    jsonb_build_object('customerId', v_customer.id, 'balancePaise', v_balance));
end;
$$;

-- Owner correction of a balance (+ adds to what is owed, − reduces it). Reason required; audited.
create or replace function public.adjust_customer_balance(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_op_id uuid;
  v_replay jsonb;
  v_customer public.customers;
  v_amount bigint;
  v_reason text;
  v_balance bigint;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_input"}');
  end if;
  v_shop_id := (p_input ->> 'shopId')::uuid;
  perform private.require_member(v_shop_id, 'udhaar.adjust');
  v_op_id := (p_input ->> 'clientOperationId')::uuid;
  v_replay := private.idem_get(v_shop_id, v_op_id, 'adjust_customer_balance', p_input);
  if v_replay is not null then
    return v_replay;
  end if;
  select * into v_customer from public.customers
   where shop_id = v_shop_id and id = (p_input ->> 'customerId')::uuid for update;
  if v_customer.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  v_amount := (p_input ->> 'amountPaise')::bigint;
  if v_amount is null or v_amount = 0 or v_amount not between -100000000 and 100000000 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"amountPaise"}');
  end if;
  v_reason := btrim(p_input ->> 'reason');
  if v_reason is null or char_length(v_reason) not between 3 and 200 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"reason"}');
  end if;
  v_balance := private.add_customer_entry(v_shop_id, v_customer.id, 'adjustment', v_amount, null, null, null, null,
                                          v_reason, v_op_id);
  perform private.write_audit('shop_user', 'udhaar.adjusted', v_shop_id, 'customer', v_customer.id::text,
    jsonb_build_object('balancePaise', v_customer.balance_paise),
    jsonb_build_object('balancePaise', v_balance, 'amountPaise', v_amount), v_reason);
  return private.idem_put(v_shop_id, v_op_id, 'adjust_customer_balance', p_input,
    jsonb_build_object('customerId', v_customer.id, 'balancePaise', v_balance));
end;
$$;

-- Customers whose cached balance differs from the sum of their entries (should always be empty).
create or replace function public.check_customer_drift(p_shop_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_member(p_shop_id, 'customer.manage');
  return coalesce((
    select jsonb_agg(jsonb_build_object('customerId', c.id, 'name', c.name, 'balancePaise', c.balance_paise,
                                        'ledgerPaise', l.total) order by c.name)
      from public.customers c
      cross join lateral (select coalesce(sum(amount_paise), 0) as total from public.customer_ledger_entries e
                           where e.shop_id = c.shop_id and e.customer_id = c.id) l
     where c.shop_id = p_shop_id and c.balance_paise <> l.total), '[]'::jsonb);
end;
$$;

-- ===========================================================================
-- 3. Billing with udhaar: create_sale, void_sale, create_sale_return, sale_json (patched copies)
-- ===========================================================================
create or replace function public.create_sale(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_op_id uuid;
  v_role text;
  v_replay jsonb;
  v_shop public.shops;
  v_settings public.shop_settings;
  v_device public.shop_devices;
  v_series public.invoice_series;
  v_occurred timestamptz;
  v_fy text;
  v_seq bigint;
  v_invoice text;
  v_lines jsonb;
  v_line jsonb;
  v_calc jsonb := '[]'::jsonb;
  v_meta jsonb := '[]'::jsonb;
  v_amount bigint;
  v_qty bigint;
  v_price bigint;
  v_line_discount bigint;
  v_product record;
  v_overrides jsonb := '[]'::jsonb;
  v_bill_discount bigint;
  v_limit_bp integer;
  v_totals jsonb;
  v_client jsonb;
  v_key text;
  v_udhaar bigint;
  v_payment jsonb;
  v_method text;
  v_paid bigint := 0;
  v_sale_id uuid;
  v_stock record;
  v_warnings jsonb := '[]'::jsonb;
  v_customer public.customers;
  v_customer_balance bigint;
  i integer;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_input"}');
  end if;
  v_shop_id := (p_input ->> 'shopId')::uuid;
  v_role := private.require_member(v_shop_id, 'sale.create');
  v_op_id := (p_input ->> 'clientOperationId')::uuid;
  v_replay := private.idem_get(v_shop_id, v_op_id, 'create_sale', p_input);
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_shop from public.shops where id = v_shop_id;
  select * into v_settings from public.shop_settings where shop_id = v_shop_id;
  select * into v_device from public.shop_devices
   where shop_id = v_shop_id and id = (p_input ->> 'deviceId')::uuid;
  if v_device.id is null or v_device.status <> 'active' then
    perform private.raise_ds('DS_DEVICE_NOT_REGISTERED');
  end if;

  if coalesce(p_input ->> 'origin', 'online') <> 'online' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"origin","reason":"unsupported"}');
  end if;
  if p_input ->> 'source' is not null and p_input ->> 'source' not in ('keypad', 'search', 'scan', 'voice') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"source"}');
  end if;
  if char_length(p_input ->> 'note') > 200 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"note","reason":"too_long"}');
  end if;

  -- Time and invoice number
  v_occurred := (p_input ->> 'occurredAt')::timestamptz;
  if v_occurred is null or v_occurred > now() + interval '5 minutes' or v_occurred < now() - interval '24 hours' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"occurredAt","reason":"out_of_range"}');
  end if;
  v_fy := p_input -> 'invoice' ->> 'fy';
  v_seq := (p_input -> 'invoice' ->> 'seq')::bigint;
  if v_fy is distinct from private.financial_year(v_occurred, v_shop.timezone) or v_seq is null or v_seq < 1 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"invoice","reason":"invalid"}');
  end if;

  -- Lines. Products are locked so price, tax and stock cannot change under the bill.
  v_lines := p_input -> 'lines';
  if jsonb_typeof(v_lines) is distinct from 'array' or jsonb_array_length(v_lines) not between 1 and 200 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"lines","reason":"count"}');
  end if;
  for i in 0 .. jsonb_array_length(v_lines) - 1 loop
    v_line := v_lines -> i;
    if char_length(btrim(v_line ->> 'label')) > 60 then
      perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('field', 'label', 'index', i));
    end if;
    v_line_discount := coalesce((v_line ->> 'lineDiscountPaise')::bigint, 0);

    if v_line ->> 'kind' = 'quick' then
      v_amount := (v_line ->> 'amountPaise')::bigint;
      if v_amount is null or v_amount < 1 or v_amount > 100000000 then
        perform private.raise_ds('DS_VALIDATION_FAILED',
          jsonb_build_object('field', 'amountPaise', 'index', i, 'reason', 'out_of_range'));
      end if;
      v_calc := v_calc || jsonb_build_array(jsonb_build_object(
        'unitPricePaise', v_amount, 'quantityMilli', 1000, 'lineDiscountPaise', v_line_discount));
      v_meta := v_meta || jsonb_build_array(jsonb_build_object(
        'kind', 'quick', 'label', nullif(btrim(v_line ->> 'label'), ''), 'quantityMilli', 1000,
        'unitPricePaise', v_amount, 'taxRateBp', 0));

    elsif v_line ->> 'kind' = 'product' then
      select p.id, p.name, p.unit_code, p.price_paise, p.last_cost_paise, p.hsn_code, p.track_stock,
             p.is_active, p.archived_at, u.allows_fraction, coalesce(tr.rate_bp, 0) as rate_bp
        into v_product
        from public.products p
        join public.units u on u.code = p.unit_code
        left join public.tax_rates tr on tr.code = p.tax_rate_code
       where p.shop_id = v_shop_id and p.id = (v_line ->> 'productId')::uuid
         for update of p;
      if v_product.id is null then
        perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('field', 'productId', 'index', i));
      end if;
      if v_product.archived_at is not null or not v_product.is_active then
        perform private.raise_ds('DS_PRODUCT_INACTIVE', jsonb_build_object('productId', v_product.id, 'index', i));
      end if;
      v_qty := (v_line ->> 'quantityMilli')::bigint;
      if v_qty is null or v_qty < 1 or v_qty > 1000000000 or (not v_product.allows_fraction and v_qty % 1000 <> 0) then
        perform private.raise_ds('DS_VALIDATION_FAILED',
          jsonb_build_object('field', 'quantityMilli', 'index', i, 'reason', 'invalid_quantity'));
      end if;
      v_price := (v_line ->> 'unitPricePaise')::bigint;
      if v_price is null or v_price < 0 or v_price > 100000000 then
        perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('field', 'unitPricePaise', 'index', i));
      end if;
      if v_price <> v_product.price_paise then
        if coalesce((v_line ->> 'priceOverride')::boolean, false) then
          if not v_settings.price_override_allowed
             or not exists (select 1 from public.role_permissions where role = v_role and permission = 'sale.price_override') then
            perform private.raise_ds('DS_PRICE_OVERRIDE_DENIED', jsonb_build_object('productId', v_product.id, 'index', i));
          end if;
          v_overrides := v_overrides || jsonb_build_array(jsonb_build_object(
            'productId', v_product.id, 'fromPaise', v_product.price_paise, 'toPaise', v_price));
        else
          perform private.raise_ds('DS_TOTAL_MISMATCH', jsonb_build_object(
            'reason', 'price_changed', 'productId', v_product.id, 'currentPricePaise', v_product.price_paise));
        end if;
      end if;
      v_calc := v_calc || jsonb_build_array(jsonb_build_object(
        'unitPricePaise', v_price, 'quantityMilli', v_qty, 'lineDiscountPaise', v_line_discount,
        'taxRateBp', v_product.rate_bp));
      v_meta := v_meta || jsonb_build_array(jsonb_build_object(
        'kind', 'product', 'productId', v_product.id, 'label', v_product.name, 'unitCode', v_product.unit_code,
        'quantityMilli', v_qty, 'unitPricePaise', v_price, 'taxRateBp', v_product.rate_bp,
        'unitCostPaise', v_product.last_cost_paise, 'hsnCode', v_product.hsn_code,
        'priceOverridden', v_price <> v_product.price_paise, 'trackStock', v_product.track_stock,
        'entryMode', case when v_line ->> 'entryMode' in ('quantity', 'amount') then v_line ->> 'entryMode' end));
    else
      perform private.raise_ds('DS_VALIDATION_FAILED',
        jsonb_build_object('field', 'lines', 'index', i, 'reason', 'unsupported_kind'));
    end if;
  end loop;

  -- Totals, discount policy (line + bill discounts against the role limit), client parity
  v_bill_discount := coalesce((p_input ->> 'billDiscountPaise')::bigint, 0);
  v_totals := private.compute_bill(v_calc, v_bill_discount, v_settings.tax_mode, v_settings.round_off_enabled);
  if (v_totals ->> 'discountPaise')::bigint > 0 then
    if not exists (select 1 from public.role_permissions where role = v_role and permission = 'sale.discount') then
      perform private.raise_ds('DS_PERMISSION_DENIED', '{"permission":"sale.discount"}');
    end if;
    v_limit_bp := case v_role when 'owner' then 10000
                              when 'manager' then v_settings.manager_discount_limit_bp
                              else v_settings.cashier_discount_limit_bp end;
    if (v_totals ->> 'discountPaise')::numeric * 10000 > v_limit_bp::numeric * (v_totals ->> 'subtotalPaise')::bigint then
      perform private.raise_ds('DS_DISCOUNT_LIMIT_EXCEEDED', jsonb_build_object('limitBp', v_limit_bp));
    end if;
  end if;
  v_client := p_input -> 'clientTotals';
  foreach v_key in array array['subtotalPaise', 'discountPaise', 'taxPaise', 'roundOffPaise', 'totalPaise'] loop
    if (v_client ->> v_key) is distinct from (v_totals ->> v_key) then
      perform private.raise_ds('DS_TOTAL_MISMATCH', jsonb_build_object('serverTotals', v_totals - 'lines'));
    end if;
  end loop;

  -- Payments (udhaar needs customers, Phase 08)
  v_udhaar := coalesce((p_input ->> 'udhaarPaise')::bigint, 0);
  if v_udhaar < 0 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"udhaarPaise"}');
  end if;
  if v_udhaar > 0 and p_input ->> 'customerId' is null then
    perform private.raise_ds('DS_CUSTOMER_REQUIRED');
  end if;
  if p_input ->> 'customerId' is not null then
    select * into v_customer from public.customers
     where shop_id = v_shop_id and id = (p_input ->> 'customerId')::uuid and archived_at is null
       for update;
    if v_customer.id is null then
      perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"customerId"}');
    end if;
  end if;
  if v_udhaar > 0 then
    if not ('udhaar' = any (v_settings.enabled_payment_methods)) then
      perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"udhaarPaise","reason":"method_not_enabled"}');
    end if;
    if not exists (select 1 from public.role_permissions where role = v_role and permission = 'udhaar.grant') then
      perform private.raise_ds('DS_PERMISSION_DENIED', '{"permission":"udhaar.grant"}');
    end if;
    -- Credit limit policy (shop setting): block refuses, warn saves and reports it.
    if v_customer.credit_limit_paise is not null
       and v_customer.balance_paise + v_udhaar > v_customer.credit_limit_paise then
      if v_settings.credit_limit_policy = 'block' then
        perform private.raise_ds('DS_CREDIT_LIMIT_EXCEEDED', jsonb_build_object(
          'limitPaise', v_customer.credit_limit_paise, 'balancePaise', v_customer.balance_paise));
      elsif v_settings.credit_limit_policy = 'warn' then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code', 'CREDIT_LIMIT',
          'limitPaise', v_customer.credit_limit_paise, 'balancePaise', v_customer.balance_paise + v_udhaar));
      end if;
    end if;
  end if;
  if jsonb_typeof(coalesce(p_input -> 'payments', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_input -> 'payments', '[]'::jsonb)) > 10 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"payments"}');
  end if;
  for v_payment in select value from jsonb_array_elements(coalesce(p_input -> 'payments', '[]'::jsonb)) loop
    v_method := v_payment ->> 'method';
    if v_method is null or v_method not in ('cash', 'upi', 'card', 'other')
       or not (v_method = any (v_settings.enabled_payment_methods)) then
      perform private.raise_ds('DS_VALIDATION_FAILED',
        jsonb_build_object('field', 'payments', 'method', v_method, 'reason', 'method_not_enabled'));
    end if;
    if (v_payment ->> 'amountPaise')::bigint is null or (v_payment ->> 'amountPaise')::bigint < 1
       or char_length(v_payment ->> 'reference') > 40 then
      perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"payments","reason":"invalid_payment"}');
    end if;
    v_paid := v_paid + (v_payment ->> 'amountPaise')::bigint;
  end loop;
  if v_paid + v_udhaar <> (v_totals ->> 'totalPaise')::bigint then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"payments","reason":"does_not_match_total"}');
  end if;

  -- Stock policy for tracked products (quantities summed per product)
  for v_stock in
    select (m ->> 'productId')::uuid as product_id, sum((m ->> 'quantityMilli')::bigint) as qty
      from jsonb_array_elements(v_meta) m
     where m ->> 'kind' = 'product' and (m ->> 'trackStock')::boolean
     group by 1
  loop
    if (select stock_on_hand_milli from public.products where id = v_stock.product_id) - v_stock.qty < 0 then
      if v_settings.negative_stock_policy = 'block' then
        perform private.raise_ds('DS_INSUFFICIENT_STOCK', jsonb_build_object('productId', v_stock.product_id,
          'stockOnHandMilli', (select stock_on_hand_milli from public.products where id = v_stock.product_id)));
      elsif v_settings.negative_stock_policy = 'warn' then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code', 'NEGATIVE_STOCK',
          'productId', v_stock.product_id,
          'stockOnHandMilli', (select stock_on_hand_milli from public.products where id = v_stock.product_id) - v_stock.qty));
      end if;
    end if;
  end loop;

  -- Invoice series: the row lock serialises bills of one device; only last_seq + 1 is accepted.
  insert into public.invoice_series (shop_id, device_id, fy, prefix)
  values (v_shop_id, v_device.id, v_fy, v_settings.invoice_prefix)
  on conflict do nothing;
  select * into v_series from public.invoice_series
   where shop_id = v_shop_id and device_id = v_device.id and fy = v_fy
   for update;
  if v_seq <> v_series.last_seq + 1 then
    perform private.raise_ds('DS_INVOICE_SEQUENCE_CONFLICT', jsonb_build_object('expectedSeq', v_series.last_seq + 1));
  end if;
  update public.invoice_series set last_seq = v_seq
   where shop_id = v_shop_id and device_id = v_device.id and fy = v_fy;
  v_invoice := v_series.prefix || '/' || v_fy || '/' || v_device.device_code || '-'
               || lpad(v_seq::text, greatest(6, char_length(v_seq::text)), '0');

  insert into public.sales (shop_id, device_id, fy, seq, invoice_number, source, occurred_at, tax_mode,
                            subtotal_paise, discount_paise, bill_discount_paise, tax_paise, round_off_paise, total_paise,
                            paid_paise, udhaar_paise, note, client_operation_id, created_by, customer_id)
  values (v_shop_id, v_device.id, v_fy, v_seq, v_invoice, p_input ->> 'source', v_occurred, v_settings.tax_mode,
          (v_totals ->> 'subtotalPaise')::bigint, (v_totals ->> 'discountPaise')::bigint, v_bill_discount,
          (v_totals ->> 'taxPaise')::bigint, (v_totals ->> 'roundOffPaise')::bigint, (v_totals ->> 'totalPaise')::bigint,
          v_paid, v_udhaar, nullif(btrim(p_input ->> 'note'), ''), v_op_id, auth.uid(), v_customer.id)
  returning id into v_sale_id;

  insert into public.sale_items (shop_id, sale_id, line_no, kind, product_id, label, unit_code, quantity_milli,
                                 unit_price_paise, gross_paise, line_discount_paise, bill_discount_share_paise,
                                 net_paise, tax_rate_bp, tax_paise, entry_mode, unit_cost_paise, hsn_code,
                                 price_overridden)
  select v_shop_id, v_sale_id, t.n, t.meta ->> 'kind', (t.meta ->> 'productId')::uuid, t.meta ->> 'label',
         t.meta ->> 'unitCode', (t.meta ->> 'quantityMilli')::bigint, (t.meta ->> 'unitPricePaise')::bigint,
         (c.calc ->> 'grossPaise')::bigint, (c.calc ->> 'lineDiscountPaise')::bigint,
         (c.calc ->> 'billDiscountSharePaise')::bigint, (c.calc ->> 'netPaise')::bigint,
         (t.meta ->> 'taxRateBp')::integer, (c.calc ->> 'taxPaise')::bigint, t.meta ->> 'entryMode',
         (t.meta ->> 'unitCostPaise')::bigint, t.meta ->> 'hsnCode', coalesce((t.meta ->> 'priceOverridden')::boolean, false)
    from jsonb_array_elements(v_meta) with ordinality as t(meta, n)
    join jsonb_array_elements(v_totals -> 'lines') with ordinality as c(calc, n) on c.n = t.n;

  insert into public.sale_payments (shop_id, sale_id, method, amount_paise, reference, confirmation)
  select v_shop_id, v_sale_id, p.value ->> 'method', (p.value ->> 'amountPaise')::bigint,
         nullif(btrim(p.value ->> 'reference'), ''), case when p.value ->> 'method' = 'upi' then 'manual' end
    from jsonb_array_elements(coalesce(p_input -> 'payments', '[]'::jsonb)) as p;

  -- Stock movements and running totals for tracked products
  for v_stock in
    select (m ->> 'productId')::uuid as product_id, sum((m ->> 'quantityMilli')::bigint) as qty
      from jsonb_array_elements(v_meta) m
     where m ->> 'kind' = 'product' and (m ->> 'trackStock')::boolean
     group by 1
  loop
    insert into public.stock_movements (shop_id, product_id, kind, quantity_milli, sale_id, created_by)
    values (v_shop_id, v_stock.product_id, 'sale', -v_stock.qty, v_sale_id, auth.uid());
    update public.products set stock_on_hand_milli = stock_on_hand_milli - v_stock.qty
     where shop_id = v_shop_id and id = v_stock.product_id;
  end loop;

  if v_udhaar > 0 then
    v_customer_balance := private.add_customer_entry(v_shop_id, v_customer.id, 'sale', v_udhaar, null, v_sale_id,
                                                     null, v_device.id, null, v_op_id);
  end if;

  if (v_totals ->> 'discountPaise')::bigint > 0 then
    perform private.write_audit('shop_user', 'sale.discount', v_shop_id, 'sale', v_sale_id::text, null,
      jsonb_build_object('discountPaise', (v_totals ->> 'discountPaise')::bigint,
                         'subtotalPaise', (v_totals ->> 'subtotalPaise')::bigint, 'invoiceNumber', v_invoice));
  end if;
  if jsonb_array_length(v_overrides) > 0 then
    perform private.write_audit('shop_user', 'sale.price_override', v_shop_id, 'sale', v_sale_id::text, null,
      jsonb_build_object('overrides', v_overrides, 'invoiceNumber', v_invoice));
  end if;

  return private.idem_put(v_shop_id, v_op_id, 'create_sale', p_input, jsonb_build_object(
    'saleId', v_sale_id,
    'invoiceNumber', v_invoice,
    'seq', v_seq,
    'status', 'completed',
    'reviewReasons', '[]'::jsonb,
    'totals', v_totals - 'lines',
    'warnings', v_warnings,
    'customerBalancePaise', v_customer_balance
  ));
end;
$$;

create or replace function public.void_sale(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_op_id uuid;
  v_role text;
  v_replay jsonb;
  v_sale public.sales;
  v_reason text;
  v_window integer;
  v_move record;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_input"}');
  end if;
  v_shop_id := (p_input ->> 'shopId')::uuid;
  v_role := private.require_member(v_shop_id, 'sale.void');
  v_op_id := (p_input ->> 'clientOperationId')::uuid;
  v_replay := private.idem_get(v_shop_id, v_op_id, 'void_sale', p_input);
  if v_replay is not null then
    return v_replay;
  end if;

  v_reason := btrim(p_input ->> 'reason');
  if v_reason is null or char_length(v_reason) not between 3 and 200 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"reason"}');
  end if;
  select * into v_sale from public.sales
   where shop_id = v_shop_id and id = (p_input ->> 'saleId')::uuid
   for update;
  if v_sale.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  if v_sale.status = 'voided' then
    perform private.raise_ds('DS_SALE_ALREADY_VOIDED');
  end if;
  -- A bill with returns cannot be voided: the returns already gave back stock and money (ADR-052).
  if exists (select 1 from public.sale_returns where shop_id = v_shop_id and sale_id = v_sale.id) then
    perform private.raise_ds('DS_CONFLICT', '{"reason":"sale_has_returns"}');
  end if;
  select void_window_minutes into v_window from public.shop_settings where shop_id = v_shop_id;
  if v_role <> 'owner' and now() > v_sale.created_at + make_interval(mins => v_window) then
    perform private.raise_ds('DS_VOID_WINDOW_EXPIRED', jsonb_build_object('windowMinutes', v_window));
  end if;

  for v_move in
    select product_id, -sum(quantity_milli) as qty
      from public.stock_movements
     where shop_id = v_shop_id and sale_id = v_sale.id and kind = 'sale'
     group by product_id
     order by product_id
  loop
    perform 1 from public.products where shop_id = v_shop_id and id = v_move.product_id for update;
    insert into public.stock_movements (shop_id, product_id, kind, quantity_milli, sale_id, created_by)
    values (v_shop_id, v_move.product_id, 'sale_void', v_move.qty, v_sale.id, auth.uid());
    update public.products set stock_on_hand_milli = stock_on_hand_milli + v_move.qty
     where shop_id = v_shop_id and id = v_move.product_id;
  end loop;

  if v_sale.udhaar_paise > 0 then
    perform private.add_customer_entry(v_shop_id, v_sale.customer_id, 'sale_void', -v_sale.udhaar_paise, null,
                                       v_sale.id, null, null, v_reason, v_op_id);
  end if;

  update public.sales
     set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
   where id = v_sale.id;
  perform private.write_audit('shop_user', 'sale.voided', v_shop_id, 'sale', v_sale.id::text,
    jsonb_build_object('status', v_sale.status, 'totalPaise', v_sale.total_paise),
    jsonb_build_object('status', 'voided', 'invoiceNumber', v_sale.invoice_number), v_reason);

  return private.idem_put(v_shop_id, v_op_id, 'void_sale', p_input, private.sale_json(v_sale.id));
end;
$$;

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
  if v_method is null or v_method not in ('cash', 'upi', 'card', 'other', 'udhaar') then
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
  -- "udhaar" refunds reduce the customer's balance instead of paying out money.
  if v_method = 'udhaar' and v_sale.customer_id is null then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"refundMethod","reason":"no_customer"}');
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

  if v_method = 'udhaar' and v_total > 0 then
    perform private.add_customer_entry(v_shop_id, v_sale.customer_id, 'sale_return', -v_total, null, v_sale.id,
                                       v_return_id, v_device.id, v_reason, v_op_id);
  end if;

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
    'customer', case when c.id is null then null else jsonb_build_object(
      'id', c.id, 'name', c.name, 'phone', c.phone_e164, 'balancePaise', c.balance_paise) end,
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
  left join public.customers c on c.shop_id = s.shop_id and c.id = s.customer_id
  where s.id = p_sale_id;
$$;

-- ===========================================================================
-- 4. Reports: udhaar collected, cash repayments in day close
-- ===========================================================================
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
    'udhaarCollectedPaise', (select coalesce(-sum(amount_paise), 0) from public.customer_ledger_entries
                              where shop_id = p_shop_id and business_date = v_date and kind = 'repayment'),
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
                        and l.kind = 'payment' and l.method = 'cash' and l.purchase_id is null), 0) as v),
  cash_repayments as (
    select coalesce(-sum(l.amount_paise), 0) as v from public.customer_ledger_entries l
     where l.shop_id = p_shop_id and l.device_id = p_device_id and l.business_date = p_date
       and l.kind = 'repayment' and l.method = 'cash')
  select jsonb_build_object(
    'openingCashPaise', p_opening,
    'cashRepaymentsPaise', (select v from cash_repayments),
    'cashSalesPaise', (select v from cash_sales),
    'cashRefundsPaise', (select v from cash_refunds),
    'cashExpensesPaise', (select v from cash_expenses),
    'cashSupplierPaymentsPaise', (select v from cash_suppliers),
    'expectedCashPaise', p_opening + (select v from cash_sales) + (select v from cash_repayments)
                         - (select v from cash_refunds)
                         - (select v from cash_expenses) - (select v from cash_suppliers));
$$;

revoke execute on function private.add_customer_entry(uuid, uuid, text, bigint, text, uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function private.customer_json(public.customers) from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.save_customer(jsonb)',
    'public.archive_customer(uuid, uuid)',
    'public.list_customers(uuid, text, text, boolean, integer)',
    'public.get_customer_ledger(uuid, uuid, integer)',
    'public.record_customer_repayment(jsonb)',
    'public.adjust_customer_balance(jsonb)',
    'public.check_customer_drift(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
