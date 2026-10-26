-- Phase 09: offline bills and sync (OFFLINE_SYNC_DESIGN.md).
-- Phones queue operations while offline and send them with sync_push; they refresh their local copies of the
-- catalogue, customers and settings with sync_pull.

-- ===========================================================================
-- 1. Customer aliases: the same phone number added as a new customer on two phones while offline
-- ===========================================================================
-- The second create is merged into the existing customer; its client id becomes an alias, so queued bills and
-- repayments that use the alias still reach the right customer without rewriting them (ADR-056).
create table private.customer_id_aliases (
  shop_id uuid not null,
  alias_id uuid not null,
  customer_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (shop_id, alias_id),
  foreign key (shop_id, customer_id) references public.customers (shop_id, id)
);
create index customer_id_aliases_customer on private.customer_id_aliases (shop_id, customer_id);

create or replace function private.resolve_customer_id(p_shop_id uuid, p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select a.customer_id from private.customer_id_aliases a
                    where a.shop_id = p_shop_id and a.alias_id = p_id), p_id);
$$;

-- ===========================================================================
-- 2. create_sale with offline_sync rules; customers resolved through aliases (patched copies)
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
  v_offline boolean;
  v_review text[] := '{}';
  v_business_date date;
  i integer;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_input"}');
  end if;
  v_shop_id := (p_input ->> 'shopId')::uuid;
  v_role := private.require_member(v_shop_id, 'sale.create');
  v_op_id := (p_input ->> 'clientOperationId')::uuid;
  -- The origin is not part of the request identity: a bill first tried online and later sent from the outbox
  -- (origin offline_sync) is the same bill (ADR-055).
  v_replay := private.idem_get(v_shop_id, v_op_id, 'create_sale', p_input - 'origin');
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

  if coalesce(p_input ->> 'origin', 'online') not in ('online', 'offline_sync') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"origin","reason":"unsupported"}');
  end if;
  -- Offline bills already happened at the counter: policy breaches are saved and flagged for the owner
  -- (status needs_review) instead of refused (OFFLINE_SYNC_DESIGN.md §6).
  v_offline := coalesce(p_input ->> 'origin', 'online') = 'offline_sync';
  if p_input ->> 'source' is not null and p_input ->> 'source' not in ('keypad', 'search', 'scan', 'voice') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"source"}');
  end if;
  if char_length(p_input ->> 'note') > 200 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"note","reason":"too_long"}');
  end if;

  -- Time and invoice number
  v_occurred := (p_input ->> 'occurredAt')::timestamptz;
  if v_occurred is null or (not v_offline and (v_occurred > now() + interval '5 minutes'
                                               or v_occurred < now() - interval '24 hours')) then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"occurredAt","reason":"out_of_range"}');
  end if;
  if v_offline and (v_occurred > now() + interval '10 minutes' or v_occurred < now() - interval '30 days') then
    v_review := v_review || 'clock_skew'::text;
    v_business_date := private.shop_today(v_shop_id);
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
        if v_offline then
          v_review := v_review || 'product_archived'::text;
        else
          perform private.raise_ds('DS_PRODUCT_INACTIVE', jsonb_build_object('productId', v_product.id, 'index', i));
        end if;
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
            if v_offline then
              v_review := v_review || 'price_override'::text;
            else
              perform private.raise_ds('DS_PRICE_OVERRIDE_DENIED', jsonb_build_object('productId', v_product.id, 'index', i));
            end if;
          end if;
          v_overrides := v_overrides || jsonb_build_array(jsonb_build_object(
            'productId', v_product.id, 'fromPaise', v_product.price_paise, 'toPaise', v_price));
        elsif v_offline then
          -- The phone's catalogue copy may be older: fine when the price was valid at some point.
          if not exists (select 1 from public.product_price_history h
                          where h.shop_id = v_shop_id and h.product_id = v_product.id and h.price_paise = v_price) then
            v_review := v_review || 'price_changed'::text;
          end if;
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
      if v_offline then
        v_review := v_review || 'discount_limit'::text;
      else
        perform private.raise_ds('DS_PERMISSION_DENIED', '{"permission":"sale.discount"}');
      end if;
    end if;
    v_limit_bp := case v_role when 'owner' then 10000
                              when 'manager' then v_settings.manager_discount_limit_bp
                              else v_settings.cashier_discount_limit_bp end;
    if (v_totals ->> 'discountPaise')::numeric * 10000 > v_limit_bp::numeric * (v_totals ->> 'subtotalPaise')::bigint then
      if v_offline then
        v_review := v_review || 'discount_limit'::text;
      else
        perform private.raise_ds('DS_DISCOUNT_LIMIT_EXCEEDED', jsonb_build_object('limitBp', v_limit_bp));
      end if;
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
     where shop_id = v_shop_id and id = private.resolve_customer_id(v_shop_id, (p_input ->> 'customerId')::uuid)
       and archived_at is null
       for update;
    if v_customer.id is null then
      perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"customerId"}');
    end if;
  end if;
  if v_udhaar > 0 then
    if not ('udhaar' = any (v_settings.enabled_payment_methods)) then
      if v_offline then
        v_review := v_review || 'method_disabled'::text;
      else
        perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"udhaarPaise","reason":"method_not_enabled"}');
      end if;
    end if;
    if not exists (select 1 from public.role_permissions where role = v_role and permission = 'udhaar.grant') then
      perform private.raise_ds('DS_PERMISSION_DENIED', '{"permission":"udhaar.grant"}');
    end if;
    -- Credit limit policy (shop setting): block refuses, warn saves and reports it.
    if v_customer.credit_limit_paise is not null
       and v_customer.balance_paise + v_udhaar > v_customer.credit_limit_paise then
      if v_settings.credit_limit_policy = 'block' and v_offline then
        v_review := v_review || 'credit_limit'::text;
      elsif v_settings.credit_limit_policy = 'block' then
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
    if v_offline and v_method in ('cash', 'upi', 'card', 'other')
       and not (v_method = any (v_settings.enabled_payment_methods)) then
      v_review := v_review || 'method_disabled'::text;
    elsif v_method is null or v_method not in ('cash', 'upi', 'card', 'other')
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
      if v_settings.negative_stock_policy = 'block' and v_offline then
        v_review := v_review || 'negative_stock'::text;
      elsif v_settings.negative_stock_policy = 'block' then
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
  -- Online: only last_seq + 1. Offline bills may arrive late or after a lost one: any unused number is accepted,
  -- a gap is flagged (DATABASE_DESIGN.md §invoice_series).
  if v_seq <> v_series.last_seq + 1 then
    if not v_offline or exists (select 1 from public.sales where shop_id = v_shop_id and device_id = v_device.id
                                                            and fy = v_fy and seq = v_seq) then
      perform private.raise_ds('DS_INVOICE_SEQUENCE_CONFLICT', jsonb_build_object('expectedSeq', v_series.last_seq + 1));
    elsif v_seq > v_series.last_seq + 1 then
      v_review := v_review || 'sequence_gap'::text;
    end if;
  end if;
  update public.invoice_series set last_seq = greatest(last_seq, v_seq)
   where shop_id = v_shop_id and device_id = v_device.id and fy = v_fy;
  v_invoice := v_series.prefix || '/' || v_fy || '/' || v_device.device_code || '-'
               || lpad(v_seq::text, greatest(6, char_length(v_seq::text)), '0');

  select coalesce(array_agg(distinct r order by r), '{}') into v_review from unnest(v_review) r;
  insert into public.sales (shop_id, device_id, fy, seq, invoice_number, source, occurred_at, tax_mode,
                            subtotal_paise, discount_paise, bill_discount_paise, tax_paise, round_off_paise, total_paise,
                            paid_paise, udhaar_paise, note, client_operation_id, created_by, customer_id,
                            id, status, review_reasons, origin, business_date)
  values (v_shop_id, v_device.id, v_fy, v_seq, v_invoice, p_input ->> 'source', v_occurred, v_settings.tax_mode,
          (v_totals ->> 'subtotalPaise')::bigint, (v_totals ->> 'discountPaise')::bigint, v_bill_discount,
          (v_totals ->> 'taxPaise')::bigint, (v_totals ->> 'roundOffPaise')::bigint, (v_totals ->> 'totalPaise')::bigint,
          v_paid, v_udhaar, nullif(btrim(p_input ->> 'note'), ''), v_op_id, auth.uid(), v_customer.id,
          coalesce((p_input ->> 'saleId')::uuid, gen_random_uuid()),
          case when cardinality(v_review) > 0 then 'needs_review' else 'completed' end, v_review,
          coalesce(p_input ->> 'origin', 'online'), v_business_date)
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

  return private.idem_put(v_shop_id, v_op_id, 'create_sale', p_input - 'origin', jsonb_build_object(
    'saleId', v_sale_id,
    'invoiceNumber', v_invoice,
    'seq', v_seq,
    'status', case when cardinality(v_review) > 0 then 'needs_review' else 'completed' end,
    'reviewReasons', to_jsonb(v_review),
    'totals', v_totals - 'lines',
    'warnings', v_warnings,
    'customerBalancePaise', v_customer_balance
  ));
end;
$$;

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
      -- A repeated quick add (retry, outbox replay) returns the customer; anything else is an edit.
      if v_existing.name = btrim(p_input ->> 'name')
         and v_existing.phone_e164 is not distinct from nullif(p_input ->> 'phone', '') then
        return private.customer_json(v_existing);
      end if;
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
   where shop_id = v_shop_id and id = private.resolve_customer_id(v_shop_id, (p_input ->> 'customerId')::uuid)
     for update;
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

-- ===========================================================================
-- 3. sync_push: queued operations from one phone, each in its own savepoint
-- ===========================================================================
-- Input: { shopId, deviceId, operations: [{ clientOperationId, operation, payload }] } (at most 50, in queue order).
-- Result per operation: applied · replayed (already applied) · needs_review (applied, flagged for the owner) ·
-- quarantined (not applied; code + details, e.g. member deactivated) · retry (transient; send again later).
-- One failed operation never undoes the others.
create or replace function public.sync_push(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_op jsonb;
  v_kind text;
  v_payload jsonb;
  v_result jsonb;
  v_status text;
  v_results jsonb := '[]'::jsonb;
  v_msg text;
  v_detail text;
  v_state text;
  v_existing public.customers;
begin
  if auth.uid() is null then
    perform private.raise_ds('DS_AUTH_REQUIRED');
  end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object'
     or jsonb_typeof(p_input -> 'operations') is distinct from 'array'
     or jsonb_array_length(p_input -> 'operations') not between 1 and 50 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"operations"}');
  end if;
  v_shop_id := (p_input ->> 'shopId')::uuid;

  for v_op in select value from jsonb_array_elements(p_input -> 'operations') loop
    v_kind := v_op ->> 'operation';
    v_payload := v_op -> 'payload';
    begin
      -- Membership, permissions and the device are checked by each RPC, so a deactivated member's queued
      -- bills come back quarantined instead of failing the whole batch.
      if jsonb_typeof(v_payload) is distinct from 'object' or v_payload ->> 'shopId' is distinct from v_shop_id::text
         or (v_kind <> 'create_customer' and v_payload ->> 'clientOperationId' is distinct from v_op ->> 'clientOperationId')
         or (v_kind = 'create_customer' and v_payload ->> 'id' is distinct from v_op ->> 'clientOperationId') then
        perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"payload"}');
      end if;
      if v_kind = 'create_sale' then
        v_result := public.create_sale(v_payload || '{"origin":"offline_sync"}'::jsonb);
      elsif v_kind = 'create_customer' then
        v_result := public.save_customer(v_payload);
      elsif v_kind = 'record_customer_repayment' then
        v_result := public.record_customer_repayment(v_payload);
      else
        perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"operation","reason":"unsupported"}');
      end if;
      v_status := case when coalesce((v_result ->> 'replayed')::boolean, false) then 'replayed'
                       when v_result ->> 'status' = 'needs_review' then 'needs_review'
                       else 'applied' end;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'clientOperationId', v_op ->> 'clientOperationId', 'status', v_status, 'result', v_result));
    exception when others then
      get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail, v_state = returned_sqlstate;
      v_existing := null;
      if v_kind = 'create_customer' and v_msg = 'DS_CONFLICT' and v_detail like '%phone%' then
        -- Same phone added on another phone first: use that customer; this client id becomes an alias.
        select * into v_existing from public.customers
         where shop_id = v_shop_id and phone_e164 = v_payload ->> 'phone' and archived_at is null;
      end if;
      if v_existing.id is not null then
        insert into private.customer_id_aliases (shop_id, alias_id, customer_id)
        values (v_shop_id, (v_payload ->> 'id')::uuid, v_existing.id)
        on conflict do nothing;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'clientOperationId', v_op ->> 'clientOperationId', 'status', 'applied',
          'result', private.customer_json(v_existing) || jsonb_build_object('mergedFromId', v_payload ->> 'id')));
      elsif v_state in ('55P03', '40P01', '40001', '57014') then
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'clientOperationId', v_op ->> 'clientOperationId', 'status', 'retry', 'code', v_state));
      else
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'clientOperationId', v_op ->> 'clientOperationId', 'status', 'quarantined',
          'code', case when v_msg like 'DS\_%' then v_msg else 'DS_INTERNAL' end,
          'details', case when v_msg like 'DS\_%' then coalesce(nullif(v_detail, ''), '{}')::jsonb
                          else jsonb_build_object('sqlstate', v_state) end));
      end if;
    end;
  end loop;
  return jsonb_build_object('results', v_results);
end;
$$;

-- ===========================================================================
-- 4. sync_pull: what changed since this phone's cursors (keyset on updated_at, id; archived rows included)
-- ===========================================================================
-- Cursors: { products, categories, customers: "updatedAt|id", aliases: "createdAt" }. Each list returns at most
-- p_limit rows; `more` tells the phone to ask again. Settings come back whole every time (one small row).
create or replace function public.sync_pull(p_shop_id uuid, p_device_id uuid, p_cursors jsonb default '{}',
                                            p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
  v_none uuid := '00000000-0000-0000-0000-000000000000';
  v_at timestamptz;
  v_id uuid;
  v_products jsonb;
  v_categories jsonb;
  v_customers jsonb;
  v_aliases jsonb;
begin
  perform private.require_member(p_shop_id);
  if not exists (select 1 from public.shop_devices where shop_id = p_shop_id and id = p_device_id and status = 'active') then
    perform private.raise_ds('DS_DEVICE_NOT_REGISTERED');
  end if;

  v_at := coalesce(nullif(split_part(coalesce(p_cursors ->> 'products', ''), '|', 1), '')::timestamptz, '-infinity');
  v_id := coalesce(nullif(split_part(coalesce(p_cursors ->> 'products', ''), '|', 2), '')::uuid, v_none);
  select jsonb_build_object(
           'rows', coalesce(jsonb_agg(private.product_json(p, false) || jsonb_build_object('archivedAt', p.archived_at)
                                      order by p.updated_at, p.id), '[]'::jsonb),
           'count', count(*))
    into v_products
    from (select * from public.products p0
           where p0.shop_id = p_shop_id and (p0.updated_at, p0.id) > (v_at, v_id)
           order by p0.updated_at, p0.id limit v_limit) p;
  v_products := jsonb_build_object(
    'rows', v_products -> 'rows',
    'cursor', coalesce((select (r ->> 'updatedAt') || '|' || (r ->> 'id')
                          from jsonb_array_elements(v_products -> 'rows') with ordinality t(r, n) order by n desc limit 1),
                       p_cursors ->> 'products'),
    'more', (v_products ->> 'count')::integer = v_limit);

  v_at := coalesce(nullif(split_part(coalesce(p_cursors ->> 'categories', ''), '|', 1), '')::timestamptz, '-infinity');
  v_id := coalesce(nullif(split_part(coalesce(p_cursors ->> 'categories', ''), '|', 2), '')::uuid, v_none);
  select jsonb_build_object(
           'rows', coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'nameHi', c.name_hi,
                                                         'sortOrder', c.sort_order, 'archivedAt', c.archived_at,
                                                         'updatedAt', c.updated_at)
                                      order by c.updated_at, c.id), '[]'::jsonb),
           'count', count(*))
    into v_categories
    from (select * from public.categories c0
           where c0.shop_id = p_shop_id and (c0.updated_at, c0.id) > (v_at, v_id)
           order by c0.updated_at, c0.id limit v_limit) c;
  v_categories := jsonb_build_object(
    'rows', v_categories -> 'rows',
    'cursor', coalesce((select (r ->> 'updatedAt') || '|' || (r ->> 'id')
                          from jsonb_array_elements(v_categories -> 'rows') with ordinality t(r, n) order by n desc limit 1),
                       p_cursors ->> 'categories'),
    'more', (v_categories ->> 'count')::integer = v_limit);

  if rls.has_permission(p_shop_id, 'customer.view') then
    v_at := coalesce(nullif(split_part(coalesce(p_cursors ->> 'customers', ''), '|', 1), '')::timestamptz, '-infinity');
    v_id := coalesce(nullif(split_part(coalesce(p_cursors ->> 'customers', ''), '|', 2), '')::uuid, v_none);
    select jsonb_build_object(
             'rows', coalesce(jsonb_agg(private.customer_json(c) || jsonb_build_object('updatedAt', c.updated_at)
                                        order by c.updated_at, c.id), '[]'::jsonb),
             'count', count(*))
      into v_customers
      from (select * from public.customers c0
             where c0.shop_id = p_shop_id and (c0.updated_at, c0.id) > (v_at, v_id)
             order by c0.updated_at, c0.id limit v_limit) c;
    v_customers := jsonb_build_object(
      'rows', v_customers -> 'rows',
      'cursor', coalesce((select (r ->> 'updatedAt') || '|' || (r ->> 'id')
                            from jsonb_array_elements(v_customers -> 'rows') with ordinality t(r, n) order by n desc limit 1),
                         p_cursors ->> 'customers'),
      'more', (v_customers ->> 'count')::integer = v_limit);
    select jsonb_build_object(
             'rows', coalesce(jsonb_agg(jsonb_build_object('aliasId', a.alias_id, 'customerId', a.customer_id)
                                        order by a.created_at), '[]'::jsonb),
             'cursor', coalesce(max(a.created_at)::text, p_cursors ->> 'aliases'))
      into v_aliases
      from private.customer_id_aliases a
     where a.shop_id = p_shop_id
       and a.created_at > coalesce(nullif(p_cursors ->> 'aliases', '')::timestamptz, '-infinity');
  else
    v_customers := jsonb_build_object('rows', '[]'::jsonb, 'cursor', p_cursors ->> 'customers', 'more', false);
    v_aliases := jsonb_build_object('rows', '[]'::jsonb, 'cursor', p_cursors ->> 'aliases');
  end if;

  return jsonb_build_object(
    'serverTime', now(),
    'products', v_products,
    'categories', v_categories,
    'customers', v_customers,
    'customerAliases', v_aliases,
    'settings', private.shop_settings_json(p_shop_id));
end;
$$;

revoke execute on function private.resolve_customer_id(uuid, uuid) from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.sync_push(jsonb)',
    'public.sync_pull(uuid, uuid, jsonb, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
