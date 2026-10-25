-- Phase 04: quick bills (features/billing.md, API_AND_RPC_CONTRACTS.md §5.1).
-- Sales, items and payments are written only by create_sale in one transaction; clients read via RLS.
-- Invoice numbers: the device proposes the next number, the server accepts only last_seq + 1 (ADR-035).

-- ===========================================================================
-- 1. Bill arithmetic — SQL twin of computeBill in packages/domain-core (fixtures/money-cases.json)
-- ===========================================================================
-- p_lines: [{ unitPricePaise, quantityMilli, lineDiscountPaise?, taxRateBp? }]
create or replace function private.compute_bill(p_lines jsonb, p_bill_discount bigint, p_tax_mode text, p_round_off boolean)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_n integer := coalesce(jsonb_array_length(p_lines), 0);
  v_bill_discount bigint := coalesce(p_bill_discount, 0);
  v_gross bigint[] := '{}';
  v_line_discount bigint[] := '{}';
  v_net bigint[] := '{}';
  v_shares bigint[];
  v_line jsonb;
  v_g bigint;
  v_d bigint;
  v_net_sum bigint := 0;
  v_final bigint;
  v_rate integer;
  v_tax bigint;
  v_out jsonb := '[]'::jsonb;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_tax_total bigint := 0;
  v_raw bigint;
  v_rounded bigint;
  i integer;
begin
  if v_bill_discount < 0 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"billDiscountPaise","reason":"negative"}');
  end if;
  for i in 0 .. v_n - 1 loop
    v_line := p_lines -> i;
    v_g := private.line_gross((v_line ->> 'unitPricePaise')::bigint, (v_line ->> 'quantityMilli')::bigint);
    v_d := coalesce((v_line ->> 'lineDiscountPaise')::bigint, 0);
    if v_d < 0 or v_d > v_g then
      perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"lineDiscountPaise","reason":"out_of_range"}');
    end if;
    v_gross := array_append(v_gross, v_g);
    v_line_discount := array_append(v_line_discount, v_d);
    v_net := array_append(v_net, v_g - v_d);
    v_net_sum := v_net_sum + v_g - v_d;
  end loop;
  if v_bill_discount > v_net_sum then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"billDiscountPaise","reason":"exceeds_bill"}');
  end if;

  v_shares := private.allocate_proportionally(v_bill_discount, v_net);
  for i in 1 .. v_n loop
    v_final := v_net[i] - v_shares[i];
    v_rate := coalesce((p_lines -> (i - 1) ->> 'taxRateBp')::integer, 0);
    v_tax := case when p_tax_mode = 'gst_regular' and v_rate > 0 then private.tax_from_inclusive(v_final, v_rate) else 0 end;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'grossPaise', v_gross[i], 'lineDiscountPaise', v_line_discount[i], 'billDiscountSharePaise', v_shares[i],
      'netPaise', v_final, 'taxPaise', v_tax));
    v_subtotal := v_subtotal + v_gross[i];
    v_discount := v_discount + v_line_discount[i] + v_shares[i];
    v_tax_total := v_tax_total + v_tax;
  end loop;

  v_raw := v_subtotal - v_discount;
  v_rounded := case when p_round_off then private.round_half_up_div(v_raw, 100) * 100 else v_raw end;
  return jsonb_build_object(
    'lines', v_out,
    'subtotalPaise', v_subtotal,
    'discountPaise', v_discount,
    'taxPaise', v_tax_total,
    'roundOffPaise', v_rounded - v_raw,
    'totalPaise', v_rounded
  );
end;
$$;

-- ===========================================================================
-- 2. Tables
-- ===========================================================================
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  device_id uuid not null,
  fy text not null check (fy ~ '^[0-9]{4}$'),
  seq bigint not null check (seq > 0),
  invoice_number text not null,
  status text not null default 'completed' check (status in ('completed', 'needs_review', 'voided')),
  review_reasons text[] not null default '{}',
  origin text not null default 'online' check (origin in ('online', 'offline_sync')),
  source text check (source is null or source in ('keypad', 'search', 'scan', 'voice')),
  occurred_at timestamptz not null,
  customer_id uuid,                            -- customers arrive in Phase 08
  tax_mode text not null check (tax_mode in ('none', 'gst_regular', 'gst_composition')),
  subtotal_paise bigint not null check (subtotal_paise >= 0),
  discount_paise bigint not null default 0 check (discount_paise >= 0),
  bill_discount_paise bigint not null default 0 check (bill_discount_paise >= 0),
  tax_paise bigint not null default 0 check (tax_paise >= 0),
  round_off_paise bigint not null default 0 check (round_off_paise between -50 and 50),
  total_paise bigint not null check (total_paise >= 0),
  paid_paise bigint not null default 0 check (paid_paise >= 0),
  udhaar_paise bigint not null default 0 check (udhaar_paise >= 0),
  note text check (note is null or char_length(note) <= 200),
  client_operation_id uuid not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id),
  void_reason text check (void_reason is null or char_length(void_reason) between 3 and 200),
  unique (shop_id, device_id, fy, seq),
  unique (shop_id, invoice_number),
  unique (shop_id, client_operation_id),
  unique (shop_id, id),
  foreign key (shop_id, device_id) references public.shop_devices (shop_id, id),
  check (total_paise = subtotal_paise - discount_paise + round_off_paise),
  check (paid_paise + udhaar_paise = total_paise),
  check ((status = 'voided') = (voided_at is not null))
);
create index sales_shop_created on public.sales (shop_id, created_at desc);
create index sales_shop_creator on public.sales (shop_id, created_by, created_at desc);
create index sales_created_by on public.sales (created_by);
create index sales_voided_by on public.sales (voided_by);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  sale_id uuid not null,
  line_no smallint not null check (line_no between 1 and 200),
  kind text not null check (kind in ('quick', 'product')),
  product_id uuid,
  label text check (label is null or char_length(label) <= 60),
  unit_code text,
  quantity_milli bigint not null check (quantity_milli > 0),
  unit_price_paise bigint not null check (unit_price_paise >= 0),
  gross_paise bigint not null check (gross_paise >= 0),
  line_discount_paise bigint not null default 0 check (line_discount_paise >= 0),
  bill_discount_share_paise bigint not null default 0 check (bill_discount_share_paise >= 0),
  net_paise bigint not null check (net_paise >= 0),
  tax_rate_bp integer not null default 0 check (tax_rate_bp between 0 and 10000),
  tax_paise bigint not null default 0 check (tax_paise >= 0),
  entry_mode text check (entry_mode is null or entry_mode in ('quantity', 'amount')),
  foreign key (shop_id, sale_id) references public.sales (shop_id, id) on delete cascade,
  foreign key (shop_id, product_id) references public.products (shop_id, id),
  unique (sale_id, line_no),
  check (kind = 'product' or product_id is null),
  check (net_paise = gross_paise - line_discount_paise - bill_discount_share_paise)
);
create index sale_items_sale on public.sale_items (shop_id, sale_id);
create index sale_items_product on public.sale_items (shop_id, product_id) where product_id is not null;

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  sale_id uuid not null,
  method text not null check (method in ('cash', 'upi', 'card', 'other')),
  amount_paise bigint not null check (amount_paise > 0),
  reference text check (reference is null or char_length(reference) <= 40),
  -- UPI is confirmed by the shopkeeper, never verified with a provider (KNOWN_LIMITATIONS.md)
  confirmation text check (confirmation is null or confirmation = 'manual'),
  created_at timestamptz not null default now(),
  foreign key (shop_id, sale_id) references public.sales (shop_id, id) on delete cascade
);
create index sale_payments_sale on public.sale_payments (shop_id, sale_id);

-- ===========================================================================
-- 3. RLS: members read sales; cashiers only their own unless the shop allows more
-- ===========================================================================
create or replace function rls.can_view_sale(p_shop_id uuid, p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.shop_members m
      join public.shops s on s.id = m.shop_id
      join public.shop_settings st on st.shop_id = m.shop_id
     where m.shop_id = p_shop_id
       and m.user_id = auth.uid()
       and m.status = 'active'
       and s.status <> 'closed'
       and (p_created_by = auth.uid()
            or st.cashier_sees_all_sales
            or exists (select 1 from public.role_permissions rp where rp.role = m.role and rp.permission = 'sale.view_all'))
  );
$$;
revoke execute on function rls.can_view_sale(uuid, uuid) from public, anon;
grant execute on function rls.can_view_sale(uuid, uuid) to authenticated;

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_payments enable row level security;

create policy sales_select on public.sales for select to authenticated
  using ((select rls.can_view_sale(shop_id, created_by)));
create policy sale_items_select on public.sale_items for select to authenticated
  using (exists (select 1 from public.sales s where s.shop_id = sale_items.shop_id and s.id = sale_items.sale_id));
create policy sale_payments_select on public.sale_payments for select to authenticated
  using (exists (select 1 from public.sales s where s.shop_id = sale_payments.shop_id and s.id = sale_payments.sale_id));

grant select on public.sales, public.sale_items, public.sale_payments to authenticated;

-- ===========================================================================
-- 4. Sale JSON (shared by create_sale replays and get_sale)
-- ===========================================================================
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
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'lineNo', i.line_no, 'kind', i.kind, 'productId', i.product_id, 'label', i.label,
               'unitCode', i.unit_code, 'quantityMilli', i.quantity_milli, 'unitPricePaise', i.unit_price_paise,
               'grossPaise', i.gross_paise, 'lineDiscountPaise', i.line_discount_paise,
               'billDiscountSharePaise', i.bill_discount_share_paise, 'netPaise', i.net_paise,
               'taxRateBp', i.tax_rate_bp, 'taxPaise', i.tax_paise) order by i.line_no)
        from public.sale_items i where i.shop_id = s.shop_id and i.sale_id = s.id), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'method', sp.method, 'amountPaise', sp.amount_paise, 'reference', sp.reference,
               'confirmation', sp.confirmation) order by sp.created_at, sp.id)
        from public.sale_payments sp where sp.shop_id = s.shop_id and sp.sale_id = s.id), '[]'::jsonb),
    'shop', jsonb_build_object(
      'name', sh.name, 'addressLine', sh.address_line, 'city', sh.city, 'pincode', sh.pincode,
      'phone', sh.phone_e164, 'gstin', st.gstin, 'upiVpa', st.upi_vpa)
  )
  from public.sales s
  join public.shops sh on sh.id = s.shop_id
  join public.shop_settings st on st.shop_id = s.shop_id
  left join public.profiles p on p.id = s.created_by
  where s.id = p_sale_id;
$$;

-- ===========================================================================
-- 5. RPCs
-- ===========================================================================

-- Creates a quick bill atomically and idempotently (API_AND_RPC_CONTRACTS.md §5.1).
-- Phase 04 accepts quick (amount) lines and cash/UPI/card/other payments; product lines arrive in Phase 05,
-- udhaar in Phase 08, offline_sync in Phase 09.
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
  v_amount bigint;
  v_label text;
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

  -- Lines
  v_lines := p_input -> 'lines';
  if jsonb_typeof(v_lines) is distinct from 'array' or jsonb_array_length(v_lines) not between 1 and 200 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"lines","reason":"count"}');
  end if;
  for i in 0 .. jsonb_array_length(v_lines) - 1 loop
    v_line := v_lines -> i;
    if v_line ->> 'kind' is distinct from 'quick' then
      perform private.raise_ds('DS_VALIDATION_FAILED',
        jsonb_build_object('field', 'lines', 'index', i, 'reason', 'unsupported_kind'));
    end if;
    v_amount := (v_line ->> 'amountPaise')::bigint;
    if v_amount is null or v_amount < 1 or v_amount > 100000000 then
      perform private.raise_ds('DS_VALIDATION_FAILED',
        jsonb_build_object('field', 'amountPaise', 'index', i, 'reason', 'out_of_range'));
    end if;
    if char_length(btrim(v_line ->> 'label')) > 60 then
      perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('field', 'label', 'index', i));
    end if;
    v_calc := v_calc || jsonb_build_array(jsonb_build_object('unitPricePaise', v_amount, 'quantityMilli', 1000));
  end loop;

  -- Totals, discount policy, client parity
  v_bill_discount := coalesce((p_input ->> 'billDiscountPaise')::bigint, 0);
  v_totals := private.compute_bill(v_calc, v_bill_discount, v_settings.tax_mode, v_settings.round_off_enabled);
  if v_bill_discount > 0 then
    if not exists (select 1 from public.role_permissions where role = v_role and permission = 'sale.discount') then
      perform private.raise_ds('DS_PERMISSION_DENIED', '{"permission":"sale.discount"}');
    end if;
    v_limit_bp := case v_role when 'owner' then 10000
                              when 'manager' then v_settings.manager_discount_limit_bp
                              else v_settings.cashier_discount_limit_bp end;
    if v_bill_discount::numeric * 10000 > v_limit_bp::numeric * (v_totals ->> 'subtotalPaise')::bigint then
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
  if v_udhaar > 0 or p_input ->> 'customerId' is not null then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"customerId","reason":"not_available"}');
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
                            paid_paise, udhaar_paise, note, client_operation_id, created_by)
  values (v_shop_id, v_device.id, v_fy, v_seq, v_invoice, p_input ->> 'source', v_occurred, v_settings.tax_mode,
          (v_totals ->> 'subtotalPaise')::bigint, (v_totals ->> 'discountPaise')::bigint, v_bill_discount,
          (v_totals ->> 'taxPaise')::bigint, (v_totals ->> 'roundOffPaise')::bigint, (v_totals ->> 'totalPaise')::bigint,
          v_paid, v_udhaar, nullif(btrim(p_input ->> 'note'), ''), v_op_id, auth.uid())
  returning id into v_sale_id;

  insert into public.sale_items (shop_id, sale_id, line_no, kind, label, quantity_milli, unit_price_paise, gross_paise,
                                 line_discount_paise, bill_discount_share_paise, net_paise, tax_rate_bp, tax_paise)
  select v_shop_id, v_sale_id, t.n, 'quick', nullif(btrim(t.line ->> 'label'), ''), 1000,
         (t.line ->> 'amountPaise')::bigint, (c.calc ->> 'grossPaise')::bigint, (c.calc ->> 'lineDiscountPaise')::bigint,
         (c.calc ->> 'billDiscountSharePaise')::bigint, (c.calc ->> 'netPaise')::bigint, 0, (c.calc ->> 'taxPaise')::bigint
    from jsonb_array_elements(v_lines) with ordinality as t(line, n)
    join jsonb_array_elements(v_totals -> 'lines') with ordinality as c(calc, n) on c.n = t.n;

  insert into public.sale_payments (shop_id, sale_id, method, amount_paise, reference, confirmation)
  select v_shop_id, v_sale_id, p.value ->> 'method', (p.value ->> 'amountPaise')::bigint,
         nullif(btrim(p.value ->> 'reference'), ''), case when p.value ->> 'method' = 'upi' then 'manual' end
    from jsonb_array_elements(coalesce(p_input -> 'payments', '[]'::jsonb)) as p;

  if v_bill_discount > 0 then
    perform private.write_audit('shop_user', 'sale.discount', v_shop_id, 'sale', v_sale_id::text, null,
      jsonb_build_object('discountPaise', v_bill_discount, 'subtotalPaise', (v_totals ->> 'subtotalPaise')::bigint,
                         'invoiceNumber', v_invoice));
  end if;

  return private.idem_put(v_shop_id, v_op_id, 'create_sale', p_input, jsonb_build_object(
    'saleId', v_sale_id,
    'invoiceNumber', v_invoice,
    'seq', v_seq,
    'status', 'completed',
    'reviewReasons', '[]'::jsonb,
    'totals', v_totals - 'lines'
  ));
end;
$$;

-- One sale for the receipt; cashiers see only their own bills unless the shop allows more.
create or replace function public.get_sale(p_shop_id uuid, p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_created_by uuid;
begin
  perform private.require_member(p_shop_id);
  select created_by into v_created_by from public.sales where shop_id = p_shop_id and id = p_sale_id;
  if v_created_by is null or not rls.can_view_sale(p_shop_id, v_created_by) then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  return private.sale_json(p_sale_id);
end;
$$;

revoke execute on function private.compute_bill(jsonb, bigint, text, boolean) from public, anon, authenticated;
revoke execute on function private.sale_json(uuid) from public, anon, authenticated;
revoke execute on function public.create_sale(jsonb) from public, anon;
revoke execute on function public.get_sale(uuid, uuid) from public, anon;
grant execute on function public.create_sale(jsonb) to authenticated;
grant execute on function public.get_sale(uuid, uuid) to authenticated;
