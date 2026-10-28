-- Phase 12: plans and entitlement editing, shop overrides, feature flags with rollout / overrides / kill switch,
-- platform config with revisions and rollback, subscription lifecycle job, verified payment events.
-- FEATURE_CONFIGURATION.md §3–8, features/subscriptions-and-entitlements.md.

-- ===========================================================================
-- 1. Feature flags
-- ===========================================================================
create table public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,40}$'),
  description text not null default '' check (char_length(description) <= 300),
  enabled boolean not null default false,
  rollout_percent integer not null default 100 check (rollout_percent between 0 and 100),
  min_app_version text check (min_app_version is null or min_app_version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$'),
  kill_switchable boolean not null default true,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);
create index feature_flags_updated_by on public.feature_flags (updated_by);

create table public.feature_flag_overrides (
  shop_id uuid not null references public.shops (id) on delete cascade,
  flag_key text not null references public.feature_flags (key) on delete cascade,
  value boolean not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  expires_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (shop_id, flag_key)
);
create index feature_flag_overrides_flag on public.feature_flag_overrides (flag_key);
create index feature_flag_overrides_created_by on public.feature_flag_overrides (created_by);

-- Every value a config key or flag has had, newest revision last. Restoring writes a new revision.
create table public.config_revisions (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('platform_config', 'feature_flag')),
  key text not null,
  revision integer not null,
  value jsonb not null,
  changed_by uuid references auth.users (id),
  changed_at timestamptz not null default now(),
  unique (kind, key, revision)
);
create index config_revisions_changed_by on public.config_revisions (changed_by);

-- Payment provider events, once each (provider event id is the idempotency key).
create table public.subscription_events (
  id bigint generated always as identity primary key,
  provider text not null check (provider ~ '^[a-z_]{2,30}$'),
  event_id text not null check (char_length(event_id) between 1 and 200),
  shop_id uuid references public.shops (id) on delete set null,
  payload jsonb not null,
  result jsonb,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);
create index subscription_events_shop on public.subscription_events (shop_id);

create index if not exists shop_entitlement_overrides_created_by on public.shop_entitlement_overrides (created_by);
create index if not exists shop_subscriptions_plan on public.shop_subscriptions (plan_id);
create index if not exists platform_config_updated_by on public.platform_config (updated_by);

alter table public.feature_flags enable row level security;
alter table public.feature_flag_overrides enable row level security;
alter table public.config_revisions enable row level security;
alter table public.subscription_events enable row level security;
revoke all on public.feature_flags, public.feature_flag_overrides, public.config_revisions,
  public.subscription_events from anon, authenticated;
revoke insert, update, delete on public.entitlement_definitions, public.subscription_plans, public.plan_entitlements,
  public.shop_subscriptions, public.shop_entitlement_overrides, public.platform_config from anon, authenticated;

insert into public.feature_flags (key, description, enabled, rollout_percent, kill_switchable) values
  ('voice_billing', 'Mic button on the bill (also needs the voice.billing entitlement)', true, 100, true),
  ('offline_sync', 'Offline bills and the sync queue', true, 100, false),
  ('thermal_printing', 'Bluetooth thermal printer (not built yet)', false, 0, true),
  ('barcode_continuous_scan', 'Keep the scanner open after each item', true, 100, true),
  ('whatsapp_receipt_share', 'Share receipts on WhatsApp', true, 100, true),
  ('udhaar_reminders', 'WhatsApp reminders for udhaar', true, 100, true),
  ('import_xlsx', 'Excel import (not built yet)', false, 0, true);

insert into public.platform_config (key, value) values
  ('support.contact', '{"whatsapp": null, "phone": null, "hours": {"en": "Mon–Sat, 10 am – 7 pm"}}'),
  ('subscription.lifecycle', '{"pastDueDays": 3, "graceDays": 7}'),
  ('import.max_file_mb', '5')
on conflict (key) do nothing;

insert into public.config_revisions (kind, key, revision, value)
select 'platform_config', key, revision, value from public.platform_config;
insert into public.config_revisions (kind, key, revision, value)
select 'feature_flag', key, revision,
       jsonb_build_object('enabled', enabled, 'rolloutPercent', rollout_percent, 'minAppVersion', min_app_version,
                          'killSwitchable', kill_switchable, 'description', description)
  from public.feature_flags;

-- ===========================================================================
-- 2. Evaluation
-- ===========================================================================
-- "1.2.10" < "1.10.0"; unparsable versions count as 0.0.0.
create or replace function private.semver_lt(p_a text, p_b text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_a, '') ~ '^[0-9]+\.[0-9]+\.[0-9]+$' then string_to_array(p_a, '.')::integer[]
              else array[0, 0, 0] end
       < case when coalesce(p_b, '') ~ '^[0-9]+\.[0-9]+\.[0-9]+$' then string_to_array(p_b, '.')::integer[]
              else array[0, 0, 0] end;
$$;

-- Deterministic bucket 0..99 per shop and flag (stable across calls and servers).
create or replace function private.flag_bucket(p_shop_id uuid, p_key text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (((hashtext(p_shop_id::text || ':' || p_key))::bigint % 100) + 100)::integer % 100;
$$;

-- FEATURE_FLAGS evaluation (FEATURE_CONFIGURATION.md §5). A disabled flag is off for everyone, overrides included:
-- the kill switch always wins (ADR-066). Otherwise a live shop override decides, then app version, then rollout.
create or replace function private.flag_enabled(p_shop_id uuid, p_key text, p_app_version text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
             when not f.enabled then false
             when o.value is not null then o.value
             when f.min_app_version is not null
                  and (p_app_version is null or private.semver_lt(p_app_version, f.min_app_version)) then false
             when f.rollout_percent >= 100 then true
             else private.flag_bucket(p_shop_id, f.key) < f.rollout_percent
           end
      from public.feature_flags f
      left join public.feature_flag_overrides o
        on o.flag_key = f.key and o.shop_id = p_shop_id and (o.expires_at is null or o.expires_at > now())
     where f.key = p_key), false);
$$;

create or replace function public.get_shop_flags(p_shop_id uuid, p_app_version text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_flags jsonb;
begin
  perform private.require_member(p_shop_id);
  select coalesce(jsonb_object_agg(f.key, private.flag_enabled(p_shop_id, f.key, p_app_version)), '{}'::jsonb)
    into v_flags from public.feature_flags f;
  return jsonb_build_object('shopId', p_shop_id, 'flags', v_flags, 'revision', md5(v_flags::text || coalesce((
    select max(created_at)::text from public.feature_flag_overrides where shop_id = p_shop_id), '')));
end;
$$;

-- Plan status for the app, now with usage of every limit the plan screen shows.
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
    'planName', (select name from public.subscription_plans where id = private.effective_plan_id(p_shop_id)),
    'subscriptionStatus', case when v_sub.status = 'trialing' and v_sub.trial_ends_at <= now() then 'expired'
                               else coalesce(v_sub.status, 'expired') end,
    'trialEndsAt', v_sub.trial_ends_at,
    'currentPeriodEndsAt', v_sub.current_period_end,
    'revision', md5(coalesce(v_entitlements::text, '') || coalesce(v_sub.updated_at::text, '') || coalesce(v_sub.status, '')
                    || coalesce(v_sub.revision::text, '')),
    'entitlements', v_entitlements,
    'usage', jsonb_build_object(
      'staff_accounts.max', private.staff_usage(p_shop_id),
      'devices.max', (select count(*) from public.shop_devices where shop_id = p_shop_id and status = 'active'),
      'products.max', (select count(*) from public.products where shop_id = p_shop_id and archived_at is null),
      'customers.max', (select count(*) from public.customers where shop_id = p_shop_id and archived_at is null))
  );
end;
$$;

-- Public app configuration (callable before sign-in); now also the support contact.
create or replace function public.get_client_config(p_app_version text default null, p_platform text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'revision', coalesce((select md5(string_agg(key || ':' || revision, ',' order by key)) from public.platform_config), 'none'),
    'minSupportedAppVersion', coalesce((select value #>> '{}' from public.platform_config where key = 'app.min_supported_version'), '0.0.0'),
    'latestAppVersion', (select value #>> '{}' from public.platform_config where key = 'app.latest_version'),
    'refreshSeconds', coalesce((select (value #>> '{}')::integer from public.platform_config where key = 'config.refresh_seconds'), 900),
    'maintenance', (select value from public.platform_config where key = 'maintenance' and (value ->> 'active')::boolean),
    'supportContact', (select value from public.platform_config where key = 'support.contact'),
    'flags', '{}'::jsonb,
    'announcements', '[]'::jsonb,
    'content', '{}'::jsonb
  ));
$$;

-- ===========================================================================
-- 3. Subscriptions: assignment, lifecycle, verified payment events
-- ===========================================================================
-- Makes `p_plan` the shop's current subscription (history kept: the previous row stops being current).
create or replace function private.assign_subscription(p_shop_id uuid, p_plan_id uuid, p_status text,
                                                       p_period_end timestamptz, p_trial_ends_at timestamptz,
                                                       p_provider text, p_provider_subscription_id text)
returns public.shop_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.shop_subscriptions;
begin
  update public.shop_subscriptions set is_current = false where shop_id = p_shop_id and is_current;
  insert into public.shop_subscriptions (shop_id, plan_id, status, current_period_end, trial_ends_at, provider,
                                         provider_subscription_id)
  values (p_shop_id, p_plan_id, p_status, p_period_end, p_trial_ends_at, p_provider, p_provider_subscription_id)
  returning * into v_row;
  return v_row;
end;
$$;

-- Daily job (pg_cron): trialing → expired at trial end; active → past_due at period end; past_due → grace after
-- `pastDueDays`; grace → expired after `graceDays` more. Billing is never blocked: expired shops fall back to the
-- free tier's limits (FEATURE_CONFIGURATION.md §4).
create or replace function private.run_subscription_lifecycle(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb := coalesce((select value from public.platform_config where key = 'subscription.lifecycle'), '{}');
  v_past_due interval := make_interval(days => coalesce((v_cfg ->> 'pastDueDays')::integer, 3));
  v_grace interval := make_interval(days => coalesce((v_cfg ->> 'graceDays')::integer, 7));
  v_row record;
  v_counts jsonb := '{}'::jsonb;
  v_to text;
begin
  for v_row in
    select ss.id, ss.shop_id, ss.status,
           case
             when ss.status = 'trialing' and ss.trial_ends_at <= p_now then 'expired'
             when ss.status = 'active' and ss.current_period_end <= p_now then 'past_due'
             when ss.status = 'past_due' and ss.current_period_end + v_past_due <= p_now then 'grace'
             when ss.status = 'grace' and ss.current_period_end + v_past_due + v_grace <= p_now then 'expired'
           end as next_status
      from public.shop_subscriptions ss
     where ss.is_current and ss.status in ('trialing', 'active', 'past_due', 'grace')
       for update
  loop
    v_to := v_row.next_status;
    continue when v_to is null;
    update public.shop_subscriptions set status = v_to where id = v_row.id;
    perform private.write_audit('system', 'subscription.status_changed', v_row.shop_id, 'shop_subscription',
      v_row.id::text, jsonb_build_object('status', v_row.status), jsonb_build_object('status', v_to));
    v_counts := jsonb_set(v_counts, array[v_to], to_jsonb(coalesce((v_counts ->> v_to)::integer, 0) + 1));
  end loop;
  return v_counts;
end;
$$;

-- Applies a payment provider event that the payment-webhook Edge Function has already verified (signature checked
-- there). Service role only (S-09). Same provider event twice → the first result is returned.
-- p_event: { provider, eventId, shopId, planCode, status: active|past_due|cancelled, periodEnd?, providerSubscriptionId? }
create or replace function public.process_verified_subscription_event(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := p_event ->> 'provider';
  v_event_id text := p_event ->> 'eventId';
  v_shop_id uuid := (p_event ->> 'shopId')::uuid;
  v_status text := p_event ->> 'status';
  v_existing public.subscription_events;
  v_plan public.subscription_plans;
  v_current public.shop_subscriptions;
  v_row public.shop_subscriptions;
  v_result jsonb;
begin
  select * into v_existing from public.subscription_events where provider = v_provider and event_id = v_event_id;
  if v_existing.id is not null then
    return v_existing.result;
  end if;
  if v_shop_id is null or not exists (select 1 from public.shops where id = v_shop_id)
     or v_status not in ('active', 'past_due', 'cancelled') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"event"}');
  end if;
  select * into v_plan from public.subscription_plans where code = p_event ->> 'planCode' and status <> 'retired';
  if v_plan.id is null then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"planCode"}');
  end if;
  select * into v_current from public.shop_subscriptions where shop_id = v_shop_id and is_current for update;

  if v_current.id is not null and v_current.plan_id = v_plan.id and v_current.provider = v_provider then
    update public.shop_subscriptions
       set status = v_status,
           current_period_end = coalesce((p_event ->> 'periodEnd')::timestamptz, current_period_end),
           provider_subscription_id = coalesce(p_event ->> 'providerSubscriptionId', provider_subscription_id)
     where id = v_current.id
    returning * into v_row;
  else
    v_row := private.assign_subscription(v_shop_id, v_plan.id, v_status, (p_event ->> 'periodEnd')::timestamptz, null,
                                         v_provider, p_event ->> 'providerSubscriptionId');
  end if;
  v_result := jsonb_build_object('subscriptionId', v_row.id, 'status', v_row.status, 'planCode', v_plan.code);
  insert into public.subscription_events (provider, event_id, shop_id, payload, result)
  values (v_provider, v_event_id, v_shop_id, p_event, v_result);
  perform private.write_audit('system', 'subscription.payment_event', v_shop_id, 'shop_subscription', v_row.id::text,
    case when v_current.id is null then null else jsonb_build_object('status', v_current.status) end,
    v_result || jsonb_build_object('provider', v_provider, 'eventId', v_event_id));
  return v_result;
end;
$$;

-- ===========================================================================
-- 4. Validation helpers
-- ===========================================================================
-- Entitlement value fits its definition: boolean, or a whole number ≥ 0 / JSON null (unlimited) for limits.
create or replace function private.check_entitlement_value(p_key text, p_value jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type text := (select value_type from public.entitlement_definitions where key = p_key);
begin
  if v_type is null then
    perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('field', 'key', 'key', p_key));
  end if;
  if (v_type = 'boolean' and jsonb_typeof(p_value) <> 'boolean')
     or (v_type = 'limit' and not (jsonb_typeof(p_value) = 'null'
                                   or (jsonb_typeof(p_value) = 'number' and (p_value #>> '{}') ~ '^[0-9]{1,9}$'))) then
    perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('field', 'value', 'key', p_key));
  end if;
end;
$$;

-- Known platform config keys and their shapes (FEATURE_CONFIGURATION.md §6). Unknown keys are refused.
create or replace function private.check_config_value(p_key text, p_value jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_ok boolean;
  semver constant text := '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$';
  int_between constant text := '^[0-9]{1,6}$';
begin
  v_ok := case p_key
    when 'app.min_supported_version' then jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ semver
    when 'app.latest_version' then jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ semver
    when 'config.refresh_seconds' then jsonb_typeof(p_value) = 'number' and (p_value #>> '{}') ~ int_between
                                       and (p_value #>> '{}')::integer between 300 and 86400
    when 'shops.max_per_user' then jsonb_typeof(p_value) = 'number' and (p_value #>> '{}') ~ int_between
                                   and (p_value #>> '{}')::integer between 1 and 50
    when 'import.max_file_mb' then jsonb_typeof(p_value) = 'number' and (p_value #>> '{}') ~ int_between
                                   and (p_value #>> '{}')::integer between 1 and 20
    when 'maintenance' then jsonb_typeof(p_value) = 'object'
                            and jsonb_typeof(p_value -> 'active') = 'boolean'
                            and jsonb_typeof(p_value -> 'message') = 'object'
                            and jsonb_typeof(p_value -> 'message' -> 'en') = 'string'
                            and coalesce(jsonb_typeof(p_value -> 'blocksWrites'), 'boolean') = 'boolean'
    when 'support.contact' then jsonb_typeof(p_value) = 'object'
                                and coalesce(jsonb_typeof(p_value -> 'whatsapp'), 'null') in ('null', 'string')
                                and coalesce(p_value ->> 'whatsapp', '+910000000000') ~ '^\+91[0-9]{10}$'
                                and coalesce(jsonb_typeof(p_value -> 'phone'), 'null') in ('null', 'string')
                                and coalesce(jsonb_typeof(p_value -> 'hours'), 'object') = 'object'
    when 'subscription.lifecycle' then jsonb_typeof(p_value) = 'object'
                                       and (p_value ->> 'pastDueDays') ~ '^[0-9]{1,2}$'
                                       and (p_value ->> 'graceDays') ~ '^[0-9]{1,2}$'
                                       and (p_value ->> 'pastDueDays')::integer <= 30
                                       and (p_value ->> 'graceDays')::integer <= 60
    else false
  end;
  if not coalesce(v_ok, false) then
    perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('field', 'value', 'key', p_key));
  end if;
end;
$$;

create or replace function private.require_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"reason"}');
  end if;
  return btrim(p_reason);
end;
$$;

create or replace function private.flag_json(f public.feature_flags)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('enabled', f.enabled, 'rolloutPercent', f.rollout_percent, 'minAppVersion', f.min_app_version,
                            'killSwitchable', f.kill_switchable, 'description', f.description);
$$;

-- ===========================================================================
-- 5. Admin RPCs: plans and entitlements (super_admin, billing_admin; analysts read)
-- ===========================================================================
create or replace function public.admin_list_plans()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_role(array['super_admin', 'billing_admin', 'analyst']);
  return jsonb_build_object(
    'definitions', coalesce((select jsonb_agg(jsonb_build_object('key', d.key, 'valueType', d.value_type,
                                                                 'defaultValue', d.default_value, 'description', d.description)
                                              order by d.key) from public.entitlement_definitions d), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', p.id, 'code', p.code, 'name', p.name, 'pricePaise', p.price_paise,
                         'billingPeriod', p.billing_period, 'trialDays', p.trial_days, 'isPublic', p.is_public,
                         'status', p.status, 'revision', p.revision, 'updatedAt', p.updated_at,
                         'shopCount', (select count(*) from public.shop_subscriptions ss
                                        where ss.plan_id = p.id and ss.is_current
                                          and ss.status in ('trialing', 'active', 'past_due', 'grace')),
                         'entitlements', coalesce((select jsonb_object_agg(pe.entitlement_key, pe.value)
                                                     from public.plan_entitlements pe where pe.plan_id = p.id), '{}'::jsonb))
                       order by p.price_paise, p.code) from public.subscription_plans p), '[]'::jsonb));
end;
$$;

-- Create (no id) or edit a plan. The fallback plans free_tier and free_trial cannot be retired.
create or replace function public.admin_save_plan(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := (p_input ->> 'id')::uuid;
  v_before public.subscription_plans;
  v_row public.subscription_plans;
begin
  perform private.require_platform_role(array['super_admin', 'billing_admin']);
  begin
    if v_id is null then
      insert into public.subscription_plans (code, name, price_paise, billing_period, trial_days, is_public, status)
      values (p_input ->> 'code', p_input -> 'name', coalesce((p_input ->> 'pricePaise')::bigint, 0),
              coalesce(p_input ->> 'billingPeriod', 'month'), coalesce((p_input ->> 'trialDays')::integer, 0),
              coalesce((p_input ->> 'isPublic')::boolean, false), coalesce(p_input ->> 'status', 'draft'))
      returning * into v_row;
    else
      select * into v_before from public.subscription_plans where id = v_id for update;
      if v_before.id is null then
        perform private.raise_ds('DS_NOT_FOUND');
      end if;
      if v_before.code in ('free_tier', 'free_trial') and p_input ->> 'status' = 'retired' then
        perform private.raise_ds('DS_CONFLICT', '{"reason":"fallback_plan"}');
      end if;
      update public.subscription_plans
         set name = coalesce(p_input -> 'name', name),
             price_paise = coalesce((p_input ->> 'pricePaise')::bigint, price_paise),
             billing_period = coalesce(p_input ->> 'billingPeriod', billing_period),
             trial_days = coalesce((p_input ->> 'trialDays')::integer, trial_days),
             is_public = coalesce((p_input ->> 'isPublic')::boolean, is_public),
             status = coalesce(p_input ->> 'status', status),
             revision = revision + 1
       where id = v_id
      returning * into v_row;
    end if;
  exception
    when unique_violation then perform private.raise_ds('DS_CONFLICT', '{"reason":"code_taken"}');
    when check_violation or not_null_violation or invalid_text_representation then
      perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('reason', sqlerrm));
  end;
  if jsonb_typeof(v_row.name) <> 'object' or coalesce(v_row.name ->> 'en', '') = '' then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"name"}');
  end if;
  perform private.write_audit('platform_admin', 'admin.plan_changed', null, 'subscription_plan', v_row.id::text,
    case when v_before.id is null then null
         else jsonb_build_object('pricePaise', v_before.price_paise, 'status', v_before.status, 'isPublic', v_before.is_public) end,
    jsonb_build_object('code', v_row.code, 'pricePaise', v_row.price_paise, 'status', v_row.status, 'isPublic', v_row.is_public));
  return jsonb_build_object('id', v_row.id, 'code', v_row.code, 'revision', v_row.revision);
end;
$$;

-- Sets one entitlement of a plan. Enforced immediately: every RPC resolves entitlements in its own transaction.
create or replace function public.admin_set_plan_entitlement(p_plan_id uuid, p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  perform private.require_platform_role(array['super_admin', 'billing_admin']);
  if not exists (select 1 from public.subscription_plans where id = p_plan_id) then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  perform private.check_entitlement_value(p_key, p_value);
  select value into v_before from public.plan_entitlements where plan_id = p_plan_id and entitlement_key = p_key;
  insert into public.plan_entitlements (plan_id, entitlement_key, value) values (p_plan_id, p_key, p_value)
  on conflict (plan_id, entitlement_key) do update set value = excluded.value;
  update public.subscription_plans set revision = revision + 1 where id = p_plan_id;
  perform private.write_audit('platform_admin', 'admin.plan_entitlement_changed', null, 'subscription_plan', p_plan_id::text,
    jsonb_build_object('key', p_key, 'value', v_before), jsonb_build_object('key', p_key, 'value', p_value));
  return jsonb_build_object('planId', p_plan_id, 'key', p_key, 'value', p_value);
end;
$$;

-- ===========================================================================
-- 6. Admin RPCs: one shop's subscription, entitlement and flag overrides
-- ===========================================================================
create or replace function public.admin_get_shop_access(p_shop_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_role(array['super_admin', 'billing_admin', 'support_agent', 'analyst']);
  if not exists (select 1 from public.shops where id = p_shop_id) then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  return jsonb_build_object(
    'effectivePlanCode', (select code from public.subscription_plans where id = private.effective_plan_id(p_shop_id)),
    'entitlements', private.resolve_entitlements(p_shop_id),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', ss.id, 'planCode', sp.code, 'status', ss.status, 'isCurrent', ss.is_current, 'provider', ss.provider,
        'trialEndsAt', ss.trial_ends_at, 'currentPeriodEnd', ss.current_period_end, 'createdAt', ss.created_at)
        order by ss.created_at desc)
        from public.shop_subscriptions ss join public.subscription_plans sp on sp.id = ss.plan_id
       where ss.shop_id = p_shop_id), '[]'::jsonb),
    'overrides', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'key', o.entitlement_key, 'value', o.value, 'reason', o.reason, 'expiresAt', o.expires_at,
        'active', o.expires_at is null or o.expires_at > now(), 'createdAt', o.created_at,
        'createdBy', (select email from auth.users where id = o.created_by))
        order by o.created_at desc)
        from public.shop_entitlement_overrides o where o.shop_id = p_shop_id), '[]'::jsonb),
    'flags', coalesce((select jsonb_agg(jsonb_build_object(
        'key', f.key, 'enabled', private.flag_enabled(p_shop_id, f.key, null),
        'override', (select jsonb_build_object('value', o.value, 'reason', o.reason, 'expiresAt', o.expires_at)
                       from public.feature_flag_overrides o
                      where o.shop_id = p_shop_id and o.flag_key = f.key
                        and (o.expires_at is null or o.expires_at > now())))
        order by f.key) from public.feature_flags f), '[]'::jsonb));
end;
$$;

-- Manual plan assignment (sales-assisted; OD-05). Status trialing or active; a reason is required and audited.
create or replace function public.admin_assign_plan(p_shop_id uuid, p_input jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := private.require_reason(p_reason);
  v_plan public.subscription_plans;
  v_status text := coalesce(p_input ->> 'status', 'active');
  v_before public.shop_subscriptions;
  v_row public.shop_subscriptions;
  v_period_end timestamptz;
  v_trial_end timestamptz;
begin
  perform private.require_platform_role(array['super_admin', 'billing_admin']);
  if not exists (select 1 from public.shops where id = p_shop_id) then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  select * into v_plan from public.subscription_plans where code = p_input ->> 'planCode' and status <> 'retired';
  if v_plan.id is null or v_status not in ('trialing', 'active') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"plan"}');
  end if;
  begin
    v_period_end := (p_input ->> 'periodEnd')::timestamptz;
    v_trial_end := (p_input ->> 'trialEndsAt')::timestamptz;
  exception when others then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"date"}');
  end;
  if v_status = 'trialing' then
    v_trial_end := coalesce(v_trial_end, now() + make_interval(days => greatest(v_plan.trial_days, 1)));
    v_period_end := coalesce(v_period_end, v_trial_end);
  end if;
  if coalesce(v_period_end, 'infinity'::timestamptz) <= now() or coalesce(v_trial_end, 'infinity'::timestamptz) <= now() then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"date","reason":"past"}');
  end if;
  select * into v_before from public.shop_subscriptions where shop_id = p_shop_id and is_current for update;
  v_row := private.assign_subscription(p_shop_id, v_plan.id, v_status, v_period_end, v_trial_end, 'manual', null);
  perform private.write_audit('platform_admin', 'admin.subscription_changed', p_shop_id, 'shop_subscription', v_row.id::text,
    case when v_before.id is null then null else jsonb_build_object('planId', v_before.plan_id, 'status', v_before.status) end,
    jsonb_build_object('planCode', v_plan.code, 'status', v_status, 'periodEnd', v_period_end, 'trialEndsAt', v_trial_end),
    v_reason);
  return jsonb_build_object('subscriptionId', v_row.id, 'planCode', v_plan.code, 'status', v_row.status);
end;
$$;

-- A per-shop exception (e.g. 50 more products for a month). Replaces the shop's live override for that key.
create or replace function public.admin_set_entitlement_override(p_shop_id uuid, p_key text, p_value jsonb,
                                                                 p_reason text, p_expires_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := private.require_reason(p_reason);
  v_id uuid;
begin
  perform private.require_platform_role(array['super_admin', 'billing_admin']);
  if not exists (select 1 from public.shops where id = p_shop_id) then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  perform private.check_entitlement_value(p_key, p_value);
  if p_expires_at is not null and p_expires_at <= now() then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"expiresAt"}');
  end if;
  update public.shop_entitlement_overrides set expires_at = now()
   where shop_id = p_shop_id and entitlement_key = p_key and (expires_at is null or expires_at > now());
  insert into public.shop_entitlement_overrides (shop_id, entitlement_key, value, reason, expires_at, created_by)
  values (p_shop_id, p_key, p_value, v_reason, p_expires_at, auth.uid())
  returning id into v_id;
  perform private.write_audit('platform_admin', 'admin.entitlement_override_set', p_shop_id, 'entitlement_override',
    v_id::text, null, jsonb_build_object('key', p_key, 'value', p_value, 'expiresAt', p_expires_at), v_reason);
  return jsonb_build_object('id', v_id, 'key', p_key, 'value', p_value);
end;
$$;

create or replace function public.admin_end_entitlement_override(p_override_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := private.require_reason(p_reason);
  v_row public.shop_entitlement_overrides;
begin
  perform private.require_platform_role(array['super_admin', 'billing_admin']);
  update public.shop_entitlement_overrides set expires_at = now()
   where id = p_override_id and (expires_at is null or expires_at > now())
  returning * into v_row;
  if v_row.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  perform private.write_audit('platform_admin', 'admin.entitlement_override_ended', v_row.shop_id, 'entitlement_override',
    v_row.id::text, jsonb_build_object('key', v_row.entitlement_key, 'value', v_row.value), null, v_reason);
end;
$$;

-- ===========================================================================
-- 7. Admin RPCs: feature flags and platform config (super_admin; analysts read flags)
-- ===========================================================================
create or replace function public.admin_list_flags()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_role(array['super_admin', 'analyst']);
  return coalesce((select jsonb_agg(private.flag_json(f) || jsonb_build_object(
      'key', f.key, 'revision', f.revision, 'updatedAt', f.updated_at,
      'updatedBy', (select email from auth.users where id = f.updated_by),
      'overrides', coalesce((select jsonb_agg(jsonb_build_object(
          'shopId', o.shop_id, 'shopName', s.name, 'value', o.value, 'reason', o.reason, 'expiresAt', o.expires_at)
          order by s.name)
          from public.feature_flag_overrides o join public.shops s on s.id = o.shop_id
         where o.flag_key = f.key and (o.expires_at is null or o.expires_at > now())), '[]'::jsonb))
    order by f.key) from public.feature_flags f), '[]'::jsonb);
end;
$$;

-- Creates or changes a flag. Turning off a flag that is not kill-switchable needs it to be marked so first.
create or replace function public.admin_save_flag(p_input jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := private.require_reason(p_reason);
  v_key text := p_input ->> 'key';
  v_before public.feature_flags;
  v_row public.feature_flags;
begin
  perform private.require_platform_role(array['super_admin']);
  select * into v_before from public.feature_flags where key = v_key for update;
  begin
    if v_before.key is null then
      insert into public.feature_flags (key, description, enabled, rollout_percent, min_app_version, kill_switchable,
                                        updated_by)
      values (v_key, coalesce(btrim(p_input ->> 'description'), ''), coalesce((p_input ->> 'enabled')::boolean, false),
              coalesce((p_input ->> 'rolloutPercent')::integer, 100), nullif(p_input ->> 'minAppVersion', ''),
              coalesce((p_input ->> 'killSwitchable')::boolean, true), auth.uid())
      returning * into v_row;
    else
      if v_before.enabled and not v_before.kill_switchable and (p_input ->> 'enabled')::boolean is false then
        perform private.raise_ds('DS_CONFLICT', '{"reason":"not_kill_switchable"}');
      end if;
      update public.feature_flags
         set description = coalesce(btrim(p_input ->> 'description'), description),
             enabled = coalesce((p_input ->> 'enabled')::boolean, enabled),
             rollout_percent = coalesce((p_input ->> 'rolloutPercent')::integer, rollout_percent),
             min_app_version = case when p_input ? 'minAppVersion' then nullif(p_input ->> 'minAppVersion', '')
                                    else min_app_version end,
             kill_switchable = coalesce((p_input ->> 'killSwitchable')::boolean, kill_switchable),
             revision = revision + 1, updated_at = now(), updated_by = auth.uid()
       where key = v_key
      returning * into v_row;
    end if;
  exception when check_violation or not_null_violation or invalid_text_representation then
    perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('reason', sqlerrm));
  end;
  insert into public.config_revisions (kind, key, revision, value, changed_by)
  values ('feature_flag', v_row.key, v_row.revision, private.flag_json(v_row), auth.uid());
  perform private.write_audit('platform_admin', 'admin.flag_changed', null, 'feature_flag', v_row.key,
    case when v_before.key is null then null else private.flag_json(v_before) end, private.flag_json(v_row), v_reason);
  return private.flag_json(v_row) || jsonb_build_object('key', v_row.key, 'revision', v_row.revision);
end;
$$;

-- Turns a flag on or off for one shop (p_value null removes the override). The kill switch still wins.
create or replace function public.admin_set_flag_override(p_shop_id uuid, p_key text, p_value boolean, p_reason text,
                                                          p_expires_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := private.require_reason(p_reason);
  v_before public.feature_flag_overrides;
begin
  perform private.require_platform_role(array['super_admin']);
  if not exists (select 1 from public.shops where id = p_shop_id)
     or not exists (select 1 from public.feature_flags where key = p_key) then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"expiresAt"}');
  end if;
  select * into v_before from public.feature_flag_overrides where shop_id = p_shop_id and flag_key = p_key;
  if p_value is null then
    delete from public.feature_flag_overrides where shop_id = p_shop_id and flag_key = p_key;
  else
    insert into public.feature_flag_overrides (shop_id, flag_key, value, reason, expires_at, created_by)
    values (p_shop_id, p_key, p_value, v_reason, p_expires_at, auth.uid())
    on conflict (shop_id, flag_key) do update
      set value = excluded.value, reason = excluded.reason, expires_at = excluded.expires_at,
          created_by = excluded.created_by, created_at = now();
  end if;
  perform private.write_audit('platform_admin', 'admin.flag_override_changed', p_shop_id, 'feature_flag', p_key,
    case when v_before.shop_id is null then null else jsonb_build_object('value', v_before.value) end,
    case when p_value is null then null else jsonb_build_object('value', p_value, 'expiresAt', p_expires_at) end, v_reason);
end;
$$;

create or replace function public.admin_list_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_role(array['super_admin']);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'key', c.key, 'value', c.value, 'revision', c.revision, 'updatedAt', c.updated_at,
      'updatedBy', (select email from auth.users where id = c.updated_by)) order by c.key)
      from public.platform_config c), '[]'::jsonb);
end;
$$;

-- Changes a config key. `p_expected_revision` guards against two operators editing at once (DS_CONFLICT).
create or replace function public.admin_set_config(p_key text, p_value jsonb, p_expected_revision integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := private.require_reason(p_reason);
  v_before public.platform_config;
  v_row public.platform_config;
begin
  perform private.require_platform_role(array['super_admin']);
  perform private.check_config_value(p_key, p_value);
  select * into v_before from public.platform_config where key = p_key for update;
  if v_before.key is not null and v_before.revision <> coalesce(p_expected_revision, -1) then
    perform private.raise_ds('DS_CONFLICT', jsonb_build_object('reason', 'stale', 'revision', v_before.revision));
  end if;
  insert into public.platform_config (key, value, updated_by) values (p_key, p_value, auth.uid())
  on conflict (key) do update
    set value = excluded.value, revision = public.platform_config.revision + 1, updated_at = now(),
        updated_by = excluded.updated_by
  returning * into v_row;
  insert into public.config_revisions (kind, key, revision, value, changed_by)
  values ('platform_config', v_row.key, v_row.revision, v_row.value, auth.uid());
  perform private.write_audit('platform_admin', 'admin.config_changed', null, 'platform_config', p_key,
    case when v_before.key is null then null else v_before.value end, v_row.value, v_reason);
  return jsonb_build_object('key', v_row.key, 'value', v_row.value, 'revision', v_row.revision);
end;
$$;

create or replace function public.admin_list_config_revisions(p_kind text, p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_role(array['super_admin']);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'revision', r.revision, 'value', r.value, 'changedAt', r.changed_at,
      'changedBy', (select email from auth.users where id = r.changed_by)) order by r.revision desc)
      from (select * from public.config_revisions where kind = p_kind and key = p_key
             order by revision desc limit 50) r), '[]'::jsonb);
end;
$$;

-- Rollback: writes the old value again as a new revision (history is never rewritten).
create or replace function public.admin_restore_revision(p_revision_id bigint, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev public.config_revisions;
begin
  perform private.require_platform_role(array['super_admin']);
  select * into v_rev from public.config_revisions where id = p_revision_id;
  if v_rev.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  if v_rev.kind = 'platform_config' then
    return public.admin_set_config(v_rev.key, v_rev.value,
      (select revision from public.platform_config where key = v_rev.key),
      'Restore revision ' || v_rev.revision || ': ' || private.require_reason(p_reason));
  end if;
  return public.admin_save_flag(v_rev.value || jsonb_build_object('key', v_rev.key),
    'Restore revision ' || v_rev.revision || ': ' || private.require_reason(p_reason));
end;
$$;

-- ===========================================================================
-- 8. Schedule and grants
-- ===========================================================================
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('subscription-lifecycle', '30 0 * * *', 'select private.run_subscription_lifecycle()');
  end if;
end;
$$;

revoke execute on function private.semver_lt(text, text) from public, anon, authenticated;
revoke execute on function private.flag_bucket(uuid, text) from public, anon, authenticated;
revoke execute on function private.flag_enabled(uuid, text, text) from public, anon, authenticated;
revoke execute on function private.assign_subscription(uuid, uuid, text, timestamptz, timestamptz, text, text)
  from public, anon, authenticated;
revoke execute on function private.run_subscription_lifecycle(timestamptz) from public, anon, authenticated;
revoke execute on function private.check_entitlement_value(text, jsonb) from public, anon, authenticated;
revoke execute on function private.check_config_value(text, jsonb) from public, anon, authenticated;
revoke execute on function private.require_reason(text) from public, anon, authenticated;
revoke execute on function private.flag_json(public.feature_flags) from public, anon, authenticated;

-- Verified payment events: service role only (the payment-webhook Edge Function), never a signed-in user (S-09).
revoke execute on function public.process_verified_subscription_event(jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.process_verified_subscription_event(jsonb) to service_role;
  end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.get_shop_flags(uuid, text)',
    'public.get_shop_entitlements(uuid)',
    'public.admin_list_plans()',
    'public.admin_save_plan(jsonb)',
    'public.admin_set_plan_entitlement(uuid, text, jsonb)',
    'public.admin_get_shop_access(uuid)',
    'public.admin_assign_plan(uuid, jsonb, text)',
    'public.admin_set_entitlement_override(uuid, text, jsonb, text, timestamptz)',
    'public.admin_end_entitlement_override(uuid, text)',
    'public.admin_list_flags()',
    'public.admin_save_flag(jsonb, text)',
    'public.admin_set_flag_override(uuid, text, boolean, text, timestamptz)',
    'public.admin_list_config()',
    'public.admin_set_config(text, jsonb, integer, text)',
    'public.admin_list_config_revisions(text, text)',
    'public.admin_restore_revision(bigint, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
-- get_client_config stays callable before sign-in (minimum-version gate).
grant execute on function public.get_client_config(text, text) to anon, authenticated;
