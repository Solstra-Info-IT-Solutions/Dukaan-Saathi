-- Phase 02: authentication profile, shops, settings, membership, invitations, devices,
-- role permissions, plans/entitlements (basic resolution), client config, idempotency.
-- Specs: features/authentication-and-shops.md, SECURITY_MODEL.md §4–5, FEATURE_CONFIGURATION.md §3–4.

-- ===========================================================================
-- 1. Schema `rls`: helpers used inside RLS policies.
--    Policies run as the querying role, so that role needs USAGE + EXECUTE here.
--    The schema is not exposed through the Data API, and every function only
--    answers questions about the caller (auth.uid()).
-- ===========================================================================
create schema if not exists rls;
revoke all on schema rls from public;
grant usage on schema rls to authenticated, service_role;
alter default privileges in schema rls revoke execute on functions from public, anon;

-- ===========================================================================
-- 2. Generic helpers (private)
-- ===========================================================================

-- Raise one of the DS_* codes from packages/contracts/src/errors.ts.
create or replace function private.raise_ds(p_code text, p_detail jsonb default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%', p_code using errcode = 'P0001', detail = coalesce(p_detail, '{}'::jsonb)::text;
end;
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 0 → 'A', 25 → 'Z', 26 → 'AA' (mirrors deviceCodeFromIndex in domain-core).
create or replace function private.device_code_from_index(p_index integer)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_n integer := p_index;
  v_code text := '';
begin
  if p_index < 0 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"negative_device_index"}');
  end if;
  loop
    v_code := chr(65 + (v_n % 26)) || v_code;
    v_n := (v_n / 26) - 1;
    exit when v_n < 0;
  end loop;
  return v_code;
end;
$$;

-- Verified contact details of the caller, normalised to E.164 / lower-case email.
create or replace function private.my_verified_contacts(out phone_e164 text, out email text)
language sql
stable
security definer
set search_path = ''
as $$
  select case when u.phone is not null and u.phone <> '' and u.phone_confirmed_at is not null
              then '+' || ltrim(u.phone, '+') end,
         case when u.email is not null and u.email_confirmed_at is not null then lower(u.email) end
    from auth.users u
   where u.id = auth.uid();
$$;

-- ===========================================================================
-- 3. Idempotency (API_AND_RPC_CONTRACTS.md §3)
-- ===========================================================================
create table private.idempotency_keys (
  scope_id uuid not null,               -- shop id, or the user id for user-scoped operations
  client_operation_id uuid not null,
  operation text not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (scope_id, client_operation_id)
);

-- Returns the stored result for a replay (with "replayed": true), null when new.
-- Raises DS_IDEMPOTENCY_CONFLICT when the id was used for a different request.
-- Takes a transaction-scoped advisory lock so concurrent duplicates serialise.
create or replace function private.idem_get(p_scope uuid, p_op_id uuid, p_operation text, p_payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row private.idempotency_keys;
begin
  if p_op_id is null then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"clientOperationId","reason":"required"}');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_scope::text || ':' || p_op_id::text, 0));
  select * into v_row from private.idempotency_keys where scope_id = p_scope and client_operation_id = p_op_id;
  if not found then
    return null;
  end if;
  if v_row.operation <> p_operation or v_row.request_hash <> md5(p_payload::text) then
    perform private.raise_ds('DS_IDEMPOTENCY_CONFLICT');
  end if;
  return v_row.result || '{"replayed": true}'::jsonb;
end;
$$;

create or replace function private.idem_put(p_scope uuid, p_op_id uuid, p_operation text, p_payload jsonb, p_result jsonb)
returns jsonb
language sql
set search_path = ''
as $$
  insert into private.idempotency_keys (scope_id, client_operation_id, operation, request_hash, result)
  values (p_scope, p_op_id, p_operation, md5(p_payload::text), p_result);
  select p_result || '{"replayed": false}'::jsonb;
$$;

-- ===========================================================================
-- 4. Identity and tenancy tables
-- ===========================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  phone_e164 text,
  email text,
  preferred_language text not null default 'hi' check (preferred_language in ('en', 'hi')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  business_category text not null
    check (business_category in ('kirana', 'general', 'medical', 'hardware', 'stationery', 'cosmetics', 'other')),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+91[6-9][0-9]{9}$'),
  address_line text check (address_line is null or char_length(address_line) <= 200),
  city text check (city is null or char_length(city) <= 80),
  state_code text check (state_code is null or state_code ~ '^[A-Z]{2}$'),
  pincode text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  timezone text not null default 'Asia/Kolkata',
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_by uuid not null references auth.users (id),
  client_operation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, client_operation_id)
);
create trigger shops_updated_at before update on public.shops
  for each row execute function private.set_updated_at();

create table public.shop_settings (
  shop_id uuid primary key references public.shops (id) on delete cascade,
  invoice_prefix text not null default 'DS' check (invoice_prefix ~ '^[A-Z0-9]{1,6}$'),
  tax_mode text not null default 'none' check (tax_mode in ('none', 'gst_regular', 'gst_composition')),
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  prices_include_tax boolean not null default true check (prices_include_tax),
  round_off_enabled boolean not null default false,
  enabled_payment_methods text[] not null default array['cash', 'upi', 'udhaar']
    check (cardinality(enabled_payment_methods) >= 1
           and enabled_payment_methods <@ array['cash', 'upi', 'card', 'other', 'udhaar']),
  upi_vpa text check (upi_vpa is null or upi_vpa ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z]{2,64}$'),
  negative_stock_policy text not null default 'warn' check (negative_stock_policy in ('allow', 'warn', 'block')),
  credit_limit_policy text not null default 'warn' check (credit_limit_policy in ('none', 'warn', 'block')),
  void_window_minutes integer not null default 1440 check (void_window_minutes between 0 and 43200),
  cashier_discount_limit_bp integer not null default 0 check (cashier_discount_limit_bp between 0 and 10000),
  manager_discount_limit_bp integer not null default 1000 check (manager_discount_limit_bp between 0 and 10000),
  price_override_allowed boolean not null default false,
  cashier_sees_all_sales boolean not null default false,
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  preferences_schema_version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  check (tax_mode = 'none' or gstin is not null)
);
create trigger shop_settings_updated_at before update on public.shop_settings
  for each row execute function private.set_updated_at();

create table public.shop_members (
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'cashier')),
  status text not null default 'active' check (status in ('active', 'deactivated')),
  invited_by uuid references auth.users (id),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create index shop_members_user on public.shop_members (user_id) where status = 'active';
create trigger shop_members_updated_at before update on public.shop_members
  for each row execute function private.set_updated_at();

create table public.shop_invitations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+91[6-9][0-9]{9}$'),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('manager', 'cashier')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references auth.users (id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (phone_e164 is not null or email is not null)
);
create unique index shop_invitations_pending_phone on public.shop_invitations (shop_id, phone_e164)
  where status = 'pending' and phone_e164 is not null;
create unique index shop_invitations_pending_email on public.shop_invitations (shop_id, lower(email))
  where status = 'pending' and email is not null;
create index shop_invitations_phone on public.shop_invitations (phone_e164) where status = 'pending';
create index shop_invitations_email on public.shop_invitations (lower(email)) where status = 'pending';
create trigger shop_invitations_updated_at before update on public.shop_invitations
  for each row execute function private.set_updated_at();

create table public.shop_devices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  installation_id uuid not null,            -- generated once per app install, kept in SecureStore
  device_code text not null check (device_code ~ '^[A-Z]{1,3}$'),
  label text check (label is null or char_length(label) <= 60),
  platform text not null check (platform in ('android', 'ios')),
  registered_by uuid not null references auth.users (id),
  app_version text,
  last_seen_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, installation_id),
  unique (shop_id, device_code),
  unique (shop_id, id)
);
create trigger shop_devices_updated_at before update on public.shop_devices
  for each row execute function private.set_updated_at();

create table public.invoice_series (
  shop_id uuid not null,
  device_id uuid not null,
  fy text not null check (fy ~ '^[0-9]{4}$'),
  prefix text not null check (prefix ~ '^[A-Z0-9]{1,6}$'),
  last_seq bigint not null default 0 check (last_seq >= 0),
  primary key (shop_id, device_id, fy),
  foreign key (shop_id, device_id) references public.shop_devices (shop_id, id) on delete cascade
);

create table public.role_permissions (
  role text not null check (role in ('owner', 'manager', 'cashier')),
  permission text not null check (permission ~ '^[a-z_]+\.[a-z_]+$'),
  primary key (role, permission)
);

-- ===========================================================================
-- 5. Plans, entitlements, platform config
-- ===========================================================================
create table public.entitlement_definitions (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  value_type text not null check (value_type in ('boolean', 'limit')),
  default_value jsonb not null,
  description text not null,
  enforced_by text not null
);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]+$'),
  name jsonb not null,
  price_paise bigint not null default 0 check (price_paise >= 0),
  billing_period text not null check (billing_period in ('month', 'year', 'none')),
  trial_days integer not null default 0 check (trial_days between 0 and 365),
  is_public boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscription_plans_updated_at before update on public.subscription_plans
  for each row execute function private.set_updated_at();

create table public.plan_entitlements (
  plan_id uuid not null references public.subscription_plans (id) on delete cascade,
  entitlement_key text not null references public.entitlement_definitions (key),
  value jsonb not null,                      -- true/false, integer limit, or JSON null = unlimited
  primary key (plan_id, entitlement_key)
);

create table public.shop_subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id),
  status text not null check (status in ('trialing', 'active', 'past_due', 'grace', 'expired', 'cancelled')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  provider text not null default 'manual',
  provider_subscription_id text,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index shop_subscriptions_one_current on public.shop_subscriptions (shop_id) where is_current;
create trigger shop_subscriptions_updated_at before update on public.shop_subscriptions
  for each row execute function private.set_updated_at();

create table public.shop_entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  entitlement_key text not null references public.entitlement_definitions (key),
  value jsonb not null,
  reason text not null check (char_length(reason) between 3 and 500),
  expires_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index shop_entitlement_overrides_shop on public.shop_entitlement_overrides (shop_id, entitlement_key);

create table public.platform_config (
  key text primary key,
  value jsonb not null,
  schema_version integer not null default 1,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

-- ===========================================================================
-- 6. RLS helpers (caller-only questions)
-- ===========================================================================
create or replace function rls.is_member(p_shop_id uuid)
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
     where m.shop_id = p_shop_id
       and m.user_id = auth.uid()
       and m.status = 'active'
       and s.status <> 'closed'
  );
$$;

create or replace function rls.has_permission(p_shop_id uuid, p_permission text)
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
      join public.role_permissions rp on rp.role = m.role and rp.permission = p_permission
     where m.shop_id = p_shop_id
       and m.user_id = auth.uid()
       and m.status = 'active'
       and s.status <> 'closed'
  );
$$;

revoke execute on function rls.is_member(uuid) from public, anon;
revoke execute on function rls.has_permission(uuid, text) from public, anon;
grant execute on function rls.is_member(uuid) to authenticated;
grant execute on function rls.has_permission(uuid, text) to authenticated;

-- ===========================================================================
-- 7. Membership guard used by every shop RPC
-- ===========================================================================
-- Raises DS_AUTH_REQUIRED / DS_NOT_A_MEMBER / DS_SHOP_SUSPENDED / DS_PERMISSION_DENIED.
-- Returns the caller's role. Membership is read per call, never from JWT claims (S-10).
create or replace function private.require_member(p_shop_id uuid, p_permission text default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_shop_status text;
begin
  if auth.uid() is null then
    perform private.raise_ds('DS_AUTH_REQUIRED');
  end if;
  select m.role, s.status into v_role, v_shop_status
    from public.shop_members m
    join public.shops s on s.id = m.shop_id
   where m.shop_id = p_shop_id and m.user_id = auth.uid() and m.status = 'active';
  if v_role is null or v_shop_status = 'closed' then
    perform private.raise_ds('DS_NOT_A_MEMBER');
  end if;
  if v_shop_status = 'suspended' then
    perform private.raise_ds('DS_SHOP_SUSPENDED');
  end if;
  if p_permission is not null
     and not exists (select 1 from public.role_permissions rp where rp.role = v_role and rp.permission = p_permission) then
    perform private.raise_ds('DS_PERMISSION_DENIED', jsonb_build_object('permission', p_permission));
  end if;
  return v_role;
end;
$$;

-- ===========================================================================
-- 8. Entitlement resolution (FEATURE_CONFIGURATION.md §4)
-- ===========================================================================
create or replace function private.effective_plan_id(p_shop_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select ss.plan_id
       from public.shop_subscriptions ss
      where ss.shop_id = p_shop_id
        and ss.is_current
        and (ss.status in ('active', 'past_due', 'grace')
             or (ss.status = 'trialing' and coalesce(ss.trial_ends_at, 'infinity'::timestamptz) > now()))),
    (select sp.id from public.subscription_plans sp where sp.code = 'free_tier')
  );
$$;

create or replace function private.resolve_entitlements(p_shop_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from (
      select distinct on (key) key, value
        from (
          select d.key, d.default_value as value, 0 as prio, 'epoch'::timestamptz as ts
            from public.entitlement_definitions d
          union all
          select pe.entitlement_key, pe.value, 1, 'epoch'::timestamptz
            from public.plan_entitlements pe
           where pe.plan_id = private.effective_plan_id(p_shop_id)
          union all
          select o.entitlement_key, o.value, 2, o.created_at
            from public.shop_entitlement_overrides o
           where o.shop_id = p_shop_id and (o.expires_at is null or o.expires_at > now())
        ) layered
       order by key, prio desc, ts desc
    ) resolved;
$$;

-- Raises DS_QUOTA_EXCEEDED when `p_used` already reaches the limit. JSON null = unlimited.
create or replace function private.assert_quota(p_shop_id uuid, p_key text, p_used bigint)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit jsonb := private.resolve_entitlements(p_shop_id) -> p_key;
begin
  if v_limit is null then
    perform private.raise_ds('DS_INTERNAL', jsonb_build_object('reason', 'unknown_entitlement', 'key', p_key));
  end if;
  if jsonb_typeof(v_limit) = 'null' then
    return;
  end if;
  if p_used >= (v_limit #>> '{}')::bigint then
    perform private.raise_ds('DS_QUOTA_EXCEEDED',
      jsonb_build_object('key', p_key, 'limit', (v_limit #>> '{}')::bigint, 'used', p_used));
  end if;
end;
$$;

create or replace function private.assert_entitlement(p_shop_id uuid, p_key text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((private.resolve_entitlements(p_shop_id) ->> p_key)::boolean, false) is not true then
    perform private.raise_ds('DS_ENTITLEMENT_REQUIRED', jsonb_build_object('key', p_key));
  end if;
end;
$$;

-- ===========================================================================
-- 9. Triggers: profile sync from auth.users, last active owner guard
-- ===========================================================================
create or replace function private.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone_e164, email)
  values (new.id,
          case when new.phone is not null and new.phone <> '' then '+' || ltrim(new.phone, '+') end,
          lower(new.email))
  on conflict (id) do update
    set phone_e164 = excluded.phone_e164,
        email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_changed
  after insert or update of phone, email on auth.users
  for each row execute function private.sync_profile_from_auth();

create or replace function private.ensure_shop_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.shops s where s.id = old.shop_id and s.status <> 'closed')
     and not exists (select 1 from public.shop_members m
                      where m.shop_id = old.shop_id and m.role = 'owner' and m.status = 'active') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"last_owner"}');
  end if;
  return null;
end;
$$;

create trigger shop_members_keep_owner
  after update or delete on public.shop_members
  for each row
  when (old.role = 'owner' and old.status = 'active')
  execute function private.ensure_shop_has_owner();

-- ===========================================================================
-- 10. RLS policies and grants
-- ===========================================================================
alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.shop_settings enable row level security;
alter table public.shop_members enable row level security;
alter table public.shop_invitations enable row level security;
alter table public.shop_devices enable row level security;
alter table public.invoice_series enable row level security;
alter table public.role_permissions enable row level security;
alter table public.entitlement_definitions enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.shop_subscriptions enable row level security;
alter table public.shop_entitlement_overrides enable row level security;
alter table public.platform_config enable row level security;

-- Hosted Supabase grants new public tables to anon/authenticated by default; start from nothing.
revoke all on public.profiles, public.shops, public.shop_settings, public.shop_members, public.shop_invitations,
  public.shop_devices, public.invoice_series, public.role_permissions, public.entitlement_definitions,
  public.subscription_plans, public.plan_entitlements, public.shop_subscriptions, public.shop_entitlement_overrides,
  public.platform_config from anon, authenticated;
revoke all on private.idempotency_keys from public, anon, authenticated;

-- Reads only. Every write goes through a security definer RPC below.
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy shops_select_member on public.shops for select to authenticated
  using ((select rls.is_member(id)));
create policy shop_settings_select_member on public.shop_settings for select to authenticated
  using ((select rls.is_member(shop_id)));
create policy shop_members_select_member on public.shop_members for select to authenticated
  using ((select rls.is_member(shop_id)));
create policy shop_invitations_select_staff_manager on public.shop_invitations for select to authenticated
  using ((select rls.has_permission(shop_id, 'staff.manage')));
create policy shop_devices_select_member on public.shop_devices for select to authenticated
  using ((select rls.is_member(shop_id)));
create policy invoice_series_select_member on public.invoice_series for select to authenticated
  using ((select rls.is_member(shop_id)));

grant select on public.profiles, public.shops, public.shop_settings, public.shop_members,
  public.shop_invitations, public.shop_devices, public.invoice_series to authenticated;
-- role_permissions, plans, entitlements, subscriptions, overrides and platform_config:
-- no client grants (S-05). Exposed only through get_my_context / get_shop_entitlements / get_client_config.

-- ===========================================================================
-- 11. JSON shapes returned to clients (camelCase, matching @ds/contracts)
-- ===========================================================================
create or replace function private.shop_settings_json(p_shop_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'shopId', s.id,
    'name', s.name,
    'businessCategory', s.business_category,
    'phone', s.phone_e164,
    'addressLine', s.address_line,
    'city', s.city,
    'stateCode', s.state_code,
    'pincode', s.pincode,
    'timezone', s.timezone,
    'invoicePrefix', st.invoice_prefix,
    'taxMode', st.tax_mode,
    'gstin', st.gstin,
    'roundOffEnabled', st.round_off_enabled,
    'enabledPaymentMethods', to_jsonb(st.enabled_payment_methods),
    'upiVpa', st.upi_vpa,
    'negativeStockPolicy', st.negative_stock_policy,
    'creditLimitPolicy', st.credit_limit_policy,
    'voidWindowMinutes', st.void_window_minutes,
    'cashierDiscountLimitBp', st.cashier_discount_limit_bp,
    'managerDiscountLimitBp', st.manager_discount_limit_bp,
    'priceOverrideAllowed', st.price_override_allowed,
    'cashierSeesAllSales', st.cashier_sees_all_sales,
    'updatedAt', st.updated_at
  )
  from public.shops s
  join public.shop_settings st on st.shop_id = s.id
  where s.id = p_shop_id;
$$;

-- ===========================================================================
-- 12. Client RPCs
-- ===========================================================================

-- Profile, active memberships with permissions, and pending invitations for the caller.
create or replace function public.get_my_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_contacts record;
begin
  if v_uid is null then
    perform private.raise_ds('DS_AUTH_REQUIRED');
  end if;
  select * into v_contacts from private.my_verified_contacts();

  return jsonb_build_object(
    'userId', v_uid,
    'profile', (select jsonb_build_object('displayName', p.display_name, 'phone', p.phone_e164,
                                          'email', p.email, 'preferredLanguage', p.preferred_language)
                  from public.profiles p where p.id = v_uid),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
               'shopId', s.id, 'shopName', s.name, 'shopStatus', s.status, 'role', m.role,
               'permissions', (select coalesce(jsonb_agg(rp.permission order by rp.permission), '[]'::jsonb)
                                 from public.role_permissions rp where rp.role = m.role))
             order by s.name)
        from public.shop_members m
        join public.shops s on s.id = m.shop_id
       where m.user_id = v_uid and m.status = 'active' and s.status <> 'closed'), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object('invitationId', i.id, 'shopId', i.shop_id, 'shopName', s.name,
                                          'role', i.role, 'expiresAt', i.expires_at)
             order by i.created_at)
        from public.shop_invitations i
        join public.shops s on s.id = i.shop_id
       where i.status = 'pending'
         and i.expires_at > now()
         and s.status = 'active'
         and ((v_contacts.phone_e164 is not null and i.phone_e164 = v_contacts.phone_e164)
              or (v_contacts.email is not null and lower(i.email) = v_contacts.email))
         and not exists (select 1 from public.shop_members mm
                          where mm.shop_id = i.shop_id and mm.user_id = v_uid and mm.status = 'active')), '[]'::jsonb)
  );
end;
$$;

create or replace function public.update_my_profile(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    perform private.raise_ds('DS_AUTH_REQUIRED');
  end if;
  if jsonb_typeof(p_patch) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('displayName', 'preferredLanguage')) then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"unknown_fields"}');
  end if;
  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  update public.profiles
     set display_name = case when p_patch ? 'displayName' then nullif(btrim(p_patch ->> 'displayName'), '') else display_name end,
         preferred_language = case when p_patch ? 'preferredLanguage' then p_patch ->> 'preferredLanguage' else preferred_language end
   where id = v_uid;
  return (select jsonb_build_object('displayName', p.display_name, 'preferredLanguage', p.preferred_language)
            from public.profiles p where p.id = v_uid);
end;
$$;

-- Creates shop + settings + owner membership + trial subscription in one transaction. Idempotent.
create or replace function public.create_shop(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_op uuid;
  v_replay jsonb;
  v_shop_id uuid;
  v_max_shops integer;
  v_trial_plan public.subscription_plans;
begin
  if v_uid is null then
    perform private.raise_ds('DS_AUTH_REQUIRED');
  end if;
  begin
    v_op := (p_input ->> 'clientOperationId')::uuid;
  exception when invalid_text_representation then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"clientOperationId"}');
  end;
  v_replay := private.idem_get(v_uid, v_op, 'create_shop', p_input);
  if v_replay is not null then
    return v_replay;
  end if;

  if exists (select 1 from jsonb_object_keys(p_input) k
              where k not in ('clientOperationId', 'name', 'businessCategory', 'phone', 'city', 'stateCode', 'pincode', 'addressLine')) then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"unknown_fields"}');
  end if;
  if char_length(btrim(coalesce(p_input ->> 'name', ''))) not between 2 and 80 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"name"}');
  end if;
  if coalesce(p_input ->> 'businessCategory', '') not in ('kirana', 'general', 'medical', 'hardware', 'stationery', 'cosmetics', 'other') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"businessCategory"}');
  end if;

  v_max_shops := coalesce((select (value #>> '{}')::integer from public.platform_config where key = 'shops.max_per_user'), 3);
  if (select count(*) from public.shops where created_by = v_uid and status <> 'closed') >= v_max_shops then
    perform private.raise_ds('DS_QUOTA_EXCEEDED', jsonb_build_object('key', 'shops.max_per_user', 'limit', v_max_shops));
  end if;

  insert into public.shops (name, business_category, phone_e164, city, state_code, pincode, address_line,
                            created_by, client_operation_id)
  values (btrim(p_input ->> 'name'), p_input ->> 'businessCategory', nullif(p_input ->> 'phone', ''),
          nullif(btrim(p_input ->> 'city'), ''), nullif(p_input ->> 'stateCode', ''), nullif(p_input ->> 'pincode', ''),
          nullif(btrim(p_input ->> 'addressLine'), ''), v_uid, v_op)
  returning id into v_shop_id;

  insert into public.shop_settings (shop_id, updated_by) values (v_shop_id, v_uid);
  insert into public.shop_members (shop_id, user_id, role) values (v_shop_id, v_uid, 'owner');

  select * into v_trial_plan from public.subscription_plans where code = 'free_trial';
  if v_trial_plan.id is not null then
    insert into public.shop_subscriptions (shop_id, plan_id, status, trial_ends_at, current_period_end)
    values (v_shop_id, v_trial_plan.id, 'trialing',
            now() + make_interval(days => v_trial_plan.trial_days), now() + make_interval(days => v_trial_plan.trial_days));
  end if;

  perform private.write_audit('shop_user', 'shop.created', v_shop_id, 'shop', v_shop_id::text, null,
                              jsonb_build_object('name', btrim(p_input ->> 'name')));
  return private.idem_put(v_uid, v_op, 'create_shop', p_input, jsonb_build_object('shopId', v_shop_id));
end;
$$;

create or replace function public.get_shop_settings(p_shop_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_member(p_shop_id);
  return private.shop_settings_json(p_shop_id);
end;
$$;

create or replace function public.update_shop_profile(p_shop_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  perform private.require_member(p_shop_id, 'settings.manage');
  if jsonb_typeof(p_patch) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) k
                 where k not in ('name', 'businessCategory', 'phone', 'addressLine', 'city', 'stateCode', 'pincode')) then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"unknown_fields"}');
  end if;
  v_before := private.shop_settings_json(p_shop_id);
  update public.shops
     set name = case when p_patch ? 'name' then btrim(p_patch ->> 'name') else name end,
         business_category = case when p_patch ? 'businessCategory' then p_patch ->> 'businessCategory' else business_category end,
         phone_e164 = case when p_patch ? 'phone' then nullif(p_patch ->> 'phone', '') else phone_e164 end,
         address_line = case when p_patch ? 'addressLine' then nullif(btrim(p_patch ->> 'addressLine'), '') else address_line end,
         city = case when p_patch ? 'city' then nullif(btrim(p_patch ->> 'city'), '') else city end,
         state_code = case when p_patch ? 'stateCode' then nullif(p_patch ->> 'stateCode', '') else state_code end,
         pincode = case when p_patch ? 'pincode' then nullif(p_patch ->> 'pincode', '') else pincode end
   where id = p_shop_id;
  perform private.write_audit('shop_user', 'shop.profile_updated', p_shop_id, 'shop', p_shop_id::text, v_before, p_patch);
  return private.shop_settings_json(p_shop_id);
end;
$$;

create or replace function public.update_shop_settings(p_shop_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  perform private.require_member(p_shop_id, 'settings.manage');
  if jsonb_typeof(p_patch) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) k
                 where k not in ('invoicePrefix', 'taxMode', 'gstin', 'roundOffEnabled', 'enabledPaymentMethods', 'upiVpa',
                                 'negativeStockPolicy', 'creditLimitPolicy', 'voidWindowMinutes',
                                 'cashierDiscountLimitBp', 'managerDiscountLimitBp', 'priceOverrideAllowed',
                                 'cashierSeesAllSales')) then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"unknown_fields"}');
  end if;
  v_before := private.shop_settings_json(p_shop_id);
  update public.shop_settings st
     set invoice_prefix = case when p_patch ? 'invoicePrefix' then p_patch ->> 'invoicePrefix' else invoice_prefix end,
         tax_mode = case when p_patch ? 'taxMode' then p_patch ->> 'taxMode' else tax_mode end,
         gstin = case when p_patch ? 'gstin' then nullif(upper(p_patch ->> 'gstin'), '') else gstin end,
         round_off_enabled = case when p_patch ? 'roundOffEnabled' then (p_patch ->> 'roundOffEnabled')::boolean else round_off_enabled end,
         enabled_payment_methods = case when p_patch ? 'enabledPaymentMethods'
                                        then array(select jsonb_array_elements_text(p_patch -> 'enabledPaymentMethods'))
                                        else enabled_payment_methods end,
         upi_vpa = case when p_patch ? 'upiVpa' then nullif(btrim(p_patch ->> 'upiVpa'), '') else upi_vpa end,
         negative_stock_policy = case when p_patch ? 'negativeStockPolicy' then p_patch ->> 'negativeStockPolicy' else negative_stock_policy end,
         credit_limit_policy = case when p_patch ? 'creditLimitPolicy' then p_patch ->> 'creditLimitPolicy' else credit_limit_policy end,
         void_window_minutes = case when p_patch ? 'voidWindowMinutes' then (p_patch ->> 'voidWindowMinutes')::integer else void_window_minutes end,
         cashier_discount_limit_bp = case when p_patch ? 'cashierDiscountLimitBp' then (p_patch ->> 'cashierDiscountLimitBp')::integer else cashier_discount_limit_bp end,
         manager_discount_limit_bp = case when p_patch ? 'managerDiscountLimitBp' then (p_patch ->> 'managerDiscountLimitBp')::integer else manager_discount_limit_bp end,
         price_override_allowed = case when p_patch ? 'priceOverrideAllowed' then (p_patch ->> 'priceOverrideAllowed')::boolean else price_override_allowed end,
         cashier_sees_all_sales = case when p_patch ? 'cashierSeesAllSales' then (p_patch ->> 'cashierSeesAllSales')::boolean else cashier_sees_all_sales end,
         updated_by = auth.uid()
   where st.shop_id = p_shop_id;
  perform private.write_audit('shop_user', 'shop.settings_updated', p_shop_id, 'shop_settings', p_shop_id::text, v_before, p_patch);
  return private.shop_settings_json(p_shop_id);
end;
$$;

-- Staff count for the staff_accounts.max quota: active non-owner members + pending invitations.
create or replace function private.staff_usage(p_shop_id uuid, p_exclude_invitation uuid default null)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.shop_members m
           where m.shop_id = p_shop_id and m.status = 'active' and m.role <> 'owner')
       + (select count(*) from public.shop_invitations i
           where i.shop_id = p_shop_id and i.status = 'pending' and i.expires_at > now()
             and i.id is distinct from p_exclude_invitation);
$$;

create or replace function public.invite_shop_member(p_shop_id uuid, p_role text, p_phone text default null, p_email text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := nullif(btrim(p_phone), '');
  v_email text := lower(nullif(btrim(p_email), ''));
  v_existing public.shop_invitations;
  v_id uuid;
begin
  perform private.require_member(p_shop_id, 'staff.manage');
  if p_role not in ('manager', 'cashier') or (v_phone is null and v_email is null) then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_invitation"}');
  end if;
  if exists (select 1 from public.shop_members m join public.profiles p on p.id = m.user_id
              where m.shop_id = p_shop_id and m.status = 'active'
                and ((v_phone is not null and p.phone_e164 = v_phone) or (v_email is not null and p.email = v_email))) then
    perform private.raise_ds('DS_CONFLICT', '{"reason":"already_member"}');
  end if;

  select * into v_existing from public.shop_invitations i
   where i.shop_id = p_shop_id and i.status = 'pending'
     and ((v_phone is not null and i.phone_e164 = v_phone) or (v_email is not null and lower(i.email) = v_email))
   for update;
  if v_existing.id is not null then
    update public.shop_invitations set role = p_role, expires_at = now() + interval '7 days' where id = v_existing.id;
    v_id := v_existing.id;
  else
    perform private.assert_quota(p_shop_id, 'staff_accounts.max', private.staff_usage(p_shop_id));
    insert into public.shop_invitations (shop_id, phone_e164, email, role, invited_by)
    values (p_shop_id, v_phone, v_email, p_role, auth.uid())
    returning id into v_id;
  end if;
  perform private.write_audit('shop_user', 'member.invited', p_shop_id, 'shop_invitation', v_id::text, null,
                              jsonb_build_object('role', p_role));
  return jsonb_build_object('invitationId', v_id);
end;
$$;

create or replace function public.accept_shop_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.shop_invitations;
  v_contacts record;
begin
  if v_uid is null then
    perform private.raise_ds('DS_AUTH_REQUIRED');
  end if;
  select * into v_contacts from private.my_verified_contacts();
  select * into v_inv from public.shop_invitations where id = p_invitation_id for update;
  -- Same answer for "does not exist" and "not yours": do not reveal invitations to other users.
  if v_inv.id is null
     or v_inv.status <> 'pending'
     or v_inv.expires_at <= now()
     or not ((v_contacts.phone_e164 is not null and v_inv.phone_e164 = v_contacts.phone_e164)
             or (v_contacts.email is not null and lower(v_inv.email) = v_contacts.email)) then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  if (select status from public.shops where id = v_inv.shop_id) <> 'active' then
    perform private.raise_ds('DS_SHOP_SUSPENDED');
  end if;
  perform private.assert_quota(v_inv.shop_id, 'staff_accounts.max', private.staff_usage(v_inv.shop_id, v_inv.id));

  insert into public.shop_members (shop_id, user_id, role, invited_by)
  values (v_inv.shop_id, v_uid, v_inv.role, v_inv.invited_by)
  on conflict (shop_id, user_id) do update
    set role = case when public.shop_members.role = 'owner' and public.shop_members.status = 'active'
                    then public.shop_members.role else excluded.role end,
        status = 'active',
        invited_by = excluded.invited_by,
        joined_at = now();
  update public.shop_invitations set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = v_inv.id;
  perform private.write_audit('shop_user', 'member.joined', v_inv.shop_id, 'shop_member', v_uid::text, null,
                              jsonb_build_object('role', v_inv.role));
  return jsonb_build_object('shopId', v_inv.shop_id, 'role', v_inv.role);
end;
$$;

create or replace function public.revoke_shop_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid;
begin
  select shop_id into v_shop from public.shop_invitations where id = p_invitation_id;
  if v_shop is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  perform private.require_member(v_shop, 'staff.manage');
  update public.shop_invitations set status = 'revoked' where id = p_invitation_id and status = 'pending';
  perform private.write_audit('shop_user', 'member.invitation_revoked', v_shop, 'shop_invitation', p_invitation_id::text);
end;
$$;

create or replace function public.update_member_role(p_shop_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  perform private.require_member(p_shop_id, 'staff.manage');
  if p_role not in ('owner', 'manager', 'cashier') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"role"}');
  end if;
  select role into v_old from public.shop_members
   where shop_id = p_shop_id and user_id = p_user_id and status = 'active' for update;
  if v_old is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  update public.shop_members set role = p_role where shop_id = p_shop_id and user_id = p_user_id;
  perform private.write_audit('shop_user', 'member.role_changed', p_shop_id, 'shop_member', p_user_id::text,
                              jsonb_build_object('role', v_old), jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.deactivate_member(p_shop_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_member(p_shop_id, 'staff.manage');
  update public.shop_members set status = 'deactivated'
   where shop_id = p_shop_id and user_id = p_user_id and status = 'active';
  if not found then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  update public.shop_devices set status = 'revoked'
   where shop_id = p_shop_id and registered_by = p_user_id and status = 'active';
  perform private.write_audit('shop_user', 'member.deactivated', p_shop_id, 'shop_member', p_user_id::text);
end;
$$;

-- Registers (or re-confirms) this app installation as a device of the shop.
-- Returns what the device needs for invoice numbering (ADR-008).
create or replace function public.register_device(p_shop_id uuid, p_installation_id uuid, p_platform text,
                                                  p_label text default null, p_app_version text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.shop_devices;
  v_index integer;
  v_fy text;
  v_prefix text;
  v_tz text;
begin
  perform private.require_member(p_shop_id);
  if p_installation_id is null or p_platform not in ('android', 'ios') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_device"}');
  end if;
  -- Serialise device-code assignment per shop.
  select timezone into v_tz from public.shops where id = p_shop_id for update;

  select * into v_device from public.shop_devices where shop_id = p_shop_id and installation_id = p_installation_id;
  if v_device.id is not null then
    if v_device.status = 'revoked' then
      perform private.raise_ds('DS_DEVICE_NOT_REGISTERED');
    end if;
    update public.shop_devices
       set last_seen_at = now(), app_version = coalesce(p_app_version, app_version)
     where id = v_device.id;
  else
    perform private.assert_quota(p_shop_id, 'devices.max',
      (select count(*) from public.shop_devices where shop_id = p_shop_id and status = 'active'));
    select count(*) into v_index from public.shop_devices where shop_id = p_shop_id;
    insert into public.shop_devices (shop_id, installation_id, device_code, label, platform, registered_by, app_version)
    values (p_shop_id, p_installation_id, private.device_code_from_index(v_index), nullif(btrim(p_label), ''),
            p_platform, auth.uid(), p_app_version)
    returning * into v_device;
    perform private.write_audit('shop_user', 'device.registered', p_shop_id, 'shop_device', v_device.id::text, null,
                                jsonb_build_object('deviceCode', v_device.device_code));
  end if;

  v_fy := private.financial_year(now(), v_tz);
  select invoice_prefix into v_prefix from public.shop_settings where shop_id = p_shop_id;
  return jsonb_build_object(
    'deviceId', v_device.id,
    'deviceCode', v_device.device_code,
    'invoicePrefix', v_prefix,
    'fy', v_fy,
    'lastSeq', coalesce((select last_seq from public.invoice_series
                          where shop_id = p_shop_id and device_id = v_device.id and fy = v_fy), 0)
  );
end;
$$;

create or replace function public.revoke_device(p_shop_id uuid, p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_member(p_shop_id, 'staff.manage');
  update public.shop_devices set status = 'revoked' where shop_id = p_shop_id and id = p_device_id and status = 'active';
  if not found then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  perform private.write_audit('shop_user', 'device.revoked', p_shop_id, 'shop_device', p_device_id::text);
end;
$$;

create or replace function public.get_shop_entitlements(p_shop_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sub record;
  v_entitlements jsonb;
begin
  perform private.require_member(p_shop_id);
  select ss.status, ss.trial_ends_at, ss.current_period_end, ss.updated_at, sp.code, sp.revision
    into v_sub
    from public.shop_subscriptions ss
    join public.subscription_plans sp on sp.id = ss.plan_id
   where ss.shop_id = p_shop_id and ss.is_current;
  v_entitlements := private.resolve_entitlements(p_shop_id);
  return jsonb_build_object(
    'shopId', p_shop_id,
    'planCode', (select code from public.subscription_plans where id = private.effective_plan_id(p_shop_id)),
    'subscriptionStatus', case when v_sub.status = 'trialing' and v_sub.trial_ends_at <= now() then 'expired'
                               else coalesce(v_sub.status, 'expired') end,
    'trialEndsAt', v_sub.trial_ends_at,
    'currentPeriodEndsAt', v_sub.current_period_end,
    'revision', md5(coalesce(v_entitlements::text, '') || coalesce(v_sub.updated_at::text, '') || coalesce(v_sub.status, '')),
    'entitlements', v_entitlements,
    'usage', jsonb_build_object(
      'staff_accounts.max', private.staff_usage(p_shop_id),
      'devices.max', (select count(*) from public.shop_devices where shop_id = p_shop_id and status = 'active'))
  );
end;
$$;

-- Public, non-sensitive app configuration. Callable before sign-in (min-version gate).
create or replace function public.get_client_config(p_app_version text default null, p_platform text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'revision', coalesce((select md5(string_agg(key || ':' || revision, ',' order by key)) from public.platform_config), 'none'),
    'minSupportedAppVersion', coalesce((select value #>> '{}' from public.platform_config where key = 'app.min_supported_version'), '0.0.0'),
    'latestAppVersion', (select value #>> '{}' from public.platform_config where key = 'app.latest_version'),
    'refreshSeconds', coalesce((select (value #>> '{}')::integer from public.platform_config where key = 'config.refresh_seconds'), 900),
    'maintenance', (select value from public.platform_config where key = 'maintenance' and (value ->> 'active')::boolean),
    'flags', '{}'::jsonb,
    'announcements', '[]'::jsonb,
    'content', '{}'::jsonb
  ) - (case when (select value from public.platform_config where key = 'app.latest_version') is null then 'latestAppVersion' else '' end)
    - (case when not exists (select 1 from public.platform_config where key = 'maintenance' and (value ->> 'active')::boolean)
            then 'maintenance' else '' end);
$$;

-- ===========================================================================
-- 13. Function privileges
-- ===========================================================================
revoke execute on all functions in schema private from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.get_my_context()',
    'public.update_my_profile(jsonb)',
    'public.create_shop(jsonb)',
    'public.get_shop_settings(uuid)',
    'public.update_shop_profile(uuid, jsonb)',
    'public.update_shop_settings(uuid, jsonb)',
    'public.invite_shop_member(uuid, text, text, text)',
    'public.accept_shop_invitation(uuid)',
    'public.revoke_shop_invitation(uuid)',
    'public.update_member_role(uuid, uuid, text)',
    'public.deactivate_member(uuid, uuid)',
    'public.register_device(uuid, uuid, text, text, text)',
    'public.revoke_device(uuid, uuid)',
    'public.get_shop_entitlements(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

revoke execute on function public.get_client_config(text, text) from public;
grant execute on function public.get_client_config(text, text) to anon, authenticated;

-- ===========================================================================
-- 14. Seed reference data (mirrors @ds/contracts; checked by 004_contracts_match.test.sql)
-- ===========================================================================
insert into public.role_permissions (role, permission)
select 'owner', p from unnest(array[
  'sale.create', 'sale.discount', 'sale.price_override', 'sale.view_all', 'sale.void', 'sale.return', 'sale.review',
  'product.view', 'product.manage', 'product.view_cost', 'stock.view', 'stock.adjust',
  'purchase.view', 'purchase.manage', 'purchase.receive', 'purchase.pay',
  'customer.view', 'customer.manage', 'customer.quick_create', 'udhaar.grant', 'udhaar.collect', 'udhaar.adjust',
  'expense.create', 'expense.view', 'day.close', 'report.view_sales', 'report.view_profit', 'report.export',
  'staff.manage', 'settings.manage', 'subscription.view', 'onboarding.request', 'support.create', 'audit.view_shop'
]) as p
union all
select 'manager', p from unnest(array[
  'sale.create', 'sale.discount', 'sale.price_override', 'sale.view_all', 'sale.void', 'sale.return', 'sale.review',
  'product.view', 'product.manage', 'product.view_cost', 'stock.view', 'stock.adjust',
  'purchase.view', 'purchase.manage', 'purchase.receive', 'purchase.pay',
  'customer.view', 'customer.manage', 'customer.quick_create', 'udhaar.grant', 'udhaar.collect',
  'expense.create', 'expense.view', 'day.close', 'report.view_sales', 'report.export',
  'subscription.view', 'onboarding.request', 'support.create'
]) as p
union all
select 'cashier', p from unnest(array[
  'sale.create', 'sale.discount', 'product.view', 'stock.view', 'customer.view', 'customer.quick_create',
  'udhaar.grant', 'udhaar.collect', 'day.close', 'support.create'
]) as p;

insert into public.entitlement_definitions (key, value_type, default_value, description, enforced_by) values
  ('products.max', 'limit', '100', 'Maximum active products', 'trigger on products (Phase 03)'),
  ('staff_accounts.max', 'limit', '1', 'Active non-owner members plus pending invitations', 'invite_shop_member, accept_shop_invitation'),
  ('devices.max', 'limit', '1', 'Active registered devices', 'register_device'),
  ('customers.max', 'limit', '200', 'Maximum customers', 'create_customer (Phase 08)'),
  ('reports.advanced', 'boolean', 'false', 'Reports beyond 7 days and breakdowns', 'get_sales_report (Phase 06)'),
  ('reports.export', 'boolean', 'false', 'CSV/PDF export', 'export-report (Phase 06)'),
  ('exports.monthly', 'limit', '0', 'Exports per month', 'export-report (Phase 06)'),
  ('catalogue.import', 'boolean', 'true', 'CSV/XLSX product import', 'import-preview, commit_product_import (Phase 03)'),
  ('import.rows_per_job', 'limit', '500', 'Rows per import job', 'import-preview (Phase 03)'),
  ('purchases.enabled', 'boolean', 'false', 'Suppliers and purchases', 'receive_purchase (Phase 07)'),
  ('offline.enabled', 'boolean', 'true', 'Offline billing', 'sync_push (Phase 09)'),
  ('voice.billing', 'boolean', 'false', 'Voice billing', 'app gate (Phase 10)'),
  ('onboarding.managed', 'boolean', 'false', 'Managed onboarding', 'create_onboarding_request (Phase 11)');

-- Placeholder plan values (DECISIONS.md OD-15). Changed later through the admin panel, not migrations.
insert into public.subscription_plans (code, name, price_paise, billing_period, trial_days, is_public, status) values
  ('free_trial', '{"en":"Free trial","hi":"मुफ़्त ट्रायल"}', 0, 'none', 30, false, 'active'),
  ('free_tier', '{"en":"Free","hi":"मुफ़्त"}', 0, 'none', 0, false, 'active'),
  ('starter', '{"en":"Starter","hi":"स्टार्टर"}', 0, 'month', 0, true, 'draft'),
  ('pro', '{"en":"Pro","hi":"प्रो"}', 0, 'month', 0, true, 'draft');

insert into public.plan_entitlements (plan_id, entitlement_key, value)
select sp.id, v.key, v.value::jsonb
  from (values
    ('free_trial', 'products.max', '2000'), ('free_trial', 'staff_accounts.max', '3'), ('free_trial', 'devices.max', '3'),
    ('free_trial', 'customers.max', 'null'), ('free_trial', 'reports.advanced', 'true'), ('free_trial', 'reports.export', 'true'),
    ('free_trial', 'exports.monthly', '20'), ('free_trial', 'catalogue.import', 'true'), ('free_trial', 'import.rows_per_job', '5000'),
    ('free_trial', 'purchases.enabled', 'true'), ('free_trial', 'offline.enabled', 'true'), ('free_trial', 'voice.billing', 'true'),
    ('free_trial', 'onboarding.managed', 'true'),
    ('free_tier', 'products.max', '100'), ('free_tier', 'staff_accounts.max', '1'), ('free_tier', 'devices.max', '1'),
    ('free_tier', 'customers.max', '200'), ('free_tier', 'reports.advanced', 'false'), ('free_tier', 'reports.export', 'false'),
    ('free_tier', 'exports.monthly', '0'), ('free_tier', 'catalogue.import', 'true'), ('free_tier', 'import.rows_per_job', '500'),
    ('free_tier', 'purchases.enabled', 'false'), ('free_tier', 'offline.enabled', 'true'), ('free_tier', 'voice.billing', 'false'),
    ('free_tier', 'onboarding.managed', 'false'),
    ('starter', 'products.max', '500'), ('starter', 'staff_accounts.max', '2'), ('starter', 'devices.max', '2'),
    ('starter', 'customers.max', '1000'), ('starter', 'reports.advanced', 'false'), ('starter', 'reports.export', 'true'),
    ('starter', 'exports.monthly', '10'), ('starter', 'catalogue.import', 'true'), ('starter', 'import.rows_per_job', '2000'),
    ('starter', 'purchases.enabled', 'true'), ('starter', 'offline.enabled', 'true'), ('starter', 'voice.billing', 'false'),
    ('starter', 'onboarding.managed', 'false'),
    ('pro', 'products.max', 'null'), ('pro', 'staff_accounts.max', '10'), ('pro', 'devices.max', '10'),
    ('pro', 'customers.max', 'null'), ('pro', 'reports.advanced', 'true'), ('pro', 'reports.export', 'true'),
    ('pro', 'exports.monthly', '100'), ('pro', 'catalogue.import', 'true'), ('pro', 'import.rows_per_job', '10000'),
    ('pro', 'purchases.enabled', 'true'), ('pro', 'offline.enabled', 'true'), ('pro', 'voice.billing', 'true'),
    ('pro', 'onboarding.managed', 'true')
  ) as v(plan_code, key, value)
  join public.subscription_plans sp on sp.code = v.plan_code;

insert into public.platform_config (key, value) values
  ('app.min_supported_version', '"0.0.0"'),
  ('config.refresh_seconds', '900'),
  ('shops.max_per_user', '3'),
  ('maintenance', '{"active": false, "message": {"en": ""}, "blocksWrites": false}');
