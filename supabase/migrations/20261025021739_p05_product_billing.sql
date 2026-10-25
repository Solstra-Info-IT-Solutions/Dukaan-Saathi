-- Phase 05: product lines (quantity / amount entry, price overrides, line discounts, GST), stock movements on sale,
-- void_sale, list_sales (features/billing.md, API_AND_RPC_CONTRACTS.md §5.1–5.2).

-- ===========================================================================
-- 1. Snapshots on sale lines; stock movements
-- ===========================================================================
alter table public.sale_items
  add column unit_cost_paise bigint check (unit_cost_paise is null or unit_cost_paise >= 0),
  add column hsn_code text,
  add column price_overridden boolean not null default false;

-- Signed quantity changes per product. Phase 05 writes `sale` / `sale_void`; Phase 07 adds purchases,
-- adjustments and opening stock. products.stock_on_hand_milli is the running total (DATABASE_DESIGN.md).
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  product_id uuid not null,
  kind text not null check (kind in ('sale', 'sale_void', 'purchase', 'adjustment', 'opening', 'import')),
  quantity_milli bigint not null check (quantity_milli <> 0),
  sale_id uuid,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (shop_id, product_id) references public.products (shop_id, id),
  foreign key (shop_id, sale_id) references public.sales (shop_id, id)
);
create index stock_movements_product on public.stock_movements (shop_id, product_id, created_at desc);
create index stock_movements_sale on public.stock_movements (shop_id, sale_id) where sale_id is not null;
create index stock_movements_created_by on public.stock_movements (created_by);

alter table public.stock_movements enable row level security;
create policy stock_movements_select on public.stock_movements for select to authenticated
  using ((select rls.has_permission(shop_id, 'stock.view')));
grant select on public.stock_movements to authenticated;

-- Receipts show HSN and price overrides.
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
    'voidedByName', vp.display_name,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'lineNo', i.line_no, 'kind', i.kind, 'productId', i.product_id, 'label', i.label,
               'unitCode', i.unit_code, 'quantityMilli', i.quantity_milli, 'unitPricePaise', i.unit_price_paise,
               'grossPaise', i.gross_paise, 'lineDiscountPaise', i.line_discount_paise,
               'billDiscountSharePaise', i.bill_discount_share_paise, 'netPaise', i.net_paise,
               'taxRateBp', i.tax_rate_bp, 'taxPaise', i.tax_paise, 'hsnCode', i.hsn_code,
               'priceOverridden', i.price_overridden) order by i.line_no)
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
  left join public.profiles vp on vp.id = s.voided_by
  where s.id = p_sale_id;
$$;

-- ===========================================================================
-- 2. create_sale: quick and product lines
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
                            paid_paise, udhaar_paise, note, client_operation_id, created_by)
  values (v_shop_id, v_device.id, v_fy, v_seq, v_invoice, p_input ->> 'source', v_occurred, v_settings.tax_mode,
          (v_totals ->> 'subtotalPaise')::bigint, (v_totals ->> 'discountPaise')::bigint, v_bill_discount,
          (v_totals ->> 'taxPaise')::bigint, (v_totals ->> 'roundOffPaise')::bigint, (v_totals ->> 'totalPaise')::bigint,
          v_paid, v_udhaar, nullif(btrim(p_input ->> 'note'), ''), v_op_id, auth.uid())
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
    'warnings', v_warnings
  ));
end;
$$;

-- ===========================================================================
-- 3. void_sale (API_AND_RPC_CONTRACTS.md §5.2). Nothing is deleted: the sale is marked voided and stock is
-- returned with `sale_void` movements.
-- ===========================================================================
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

  update public.sales
     set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
   where id = v_sale.id;
  perform private.write_audit('shop_user', 'sale.voided', v_shop_id, 'sale', v_sale.id::text,
    jsonb_build_object('status', v_sale.status, 'totalPaise', v_sale.total_paise),
    jsonb_build_object('status', 'voided', 'invoiceNumber', v_sale.invoice_number), v_reason);

  return private.idem_put(v_shop_id, v_op_id, 'void_sale', p_input, private.sale_json(v_sale.id));
end;
$$;

-- ===========================================================================
-- 4. list_sales: newest first, keyset cursor "createdAt|id", cashier scope as in get_sale
-- ===========================================================================
create or replace function public.list_sales(p_shop_id uuid, p_from timestamptz default null, p_to timestamptz default null,
                                             p_status text default null, p_query text default null,
                                             p_cursor text default null, p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_q text := nullif(lower(btrim(p_query)), '');
  v_rows jsonb;
begin
  perform private.require_member(p_shop_id);
  if p_status is not null and p_status not in ('completed', 'needs_review', 'voided') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"status"}');
  end if;
  if p_cursor is not null then
    v_cursor_at := split_part(p_cursor, '|', 1)::timestamptz;
    v_cursor_id := split_part(p_cursor, '|', 2)::uuid;
  end if;

  select coalesce(jsonb_agg(r.item order by r.created_at desc, r.id desc), '[]'::jsonb)
    into v_rows
    from (
      select s.created_at, s.id, jsonb_build_object(
               'saleId', s.id,
               'invoiceNumber', s.invoice_number,
               'createdAt', s.created_at,
               'status', s.status,
               'totalPaise', s.total_paise,
               'itemCount', (select count(*) from public.sale_items i where i.shop_id = s.shop_id and i.sale_id = s.id),
               'methods', coalesce((select jsonb_agg(distinct sp.method) from public.sale_payments sp
                                     where sp.shop_id = s.shop_id and sp.sale_id = s.id), '[]'::jsonb),
               'createdByName', p.display_name) as item
        from public.sales s
        left join public.profiles p on p.id = s.created_by
       where s.shop_id = p_shop_id
         and rls.can_view_sale(s.shop_id, s.created_by)
         and (p_from is null or s.created_at >= p_from)
         and (p_to is null or s.created_at < p_to)
         and (p_status is null or s.status = p_status)
         and (v_q is null
              or lower(s.invoice_number) like '%' || v_q || '%'
              or exists (select 1 from public.sale_items i
                          where i.shop_id = s.shop_id and i.sale_id = s.id and lower(i.label) like '%' || v_q || '%'))
         and (v_cursor_at is null or (s.created_at, s.id) < (v_cursor_at, v_cursor_id))
       order by s.created_at desc, s.id desc
       limit v_limit + 1
    ) r;

  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(x order by n), '[]'::jsonb)
                from jsonb_array_elements(v_rows) with ordinality t(x, n) where n <= v_limit),
    'nextCursor', case when jsonb_array_length(v_rows) > v_limit
                       then (v_rows -> (v_limit - 1) ->> 'createdAt') || '|' || (v_rows -> (v_limit - 1) ->> 'saleId') end
  );
end;
$$;

revoke execute on function public.void_sale(jsonb) from public, anon;
revoke execute on function public.list_sales(uuid, timestamptz, timestamptz, text, text, text, integer) from public, anon;
grant execute on function public.void_sale(jsonb) to authenticated;
grant execute on function public.list_sales(uuid, timestamptz, timestamptz, text, text, text, integer) to authenticated;
