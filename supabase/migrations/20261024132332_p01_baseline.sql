-- Phase 01 baseline (DATABASE_DESIGN.md §1, §4, §12; SECURITY_MODEL.md §4–5).
-- Schemas, default privileges, money functions mirrored from @ds/domain-core, the audit log,
-- and the minimum platform-operator lookup the admin guard needs.

-- ---------------------------------------------------------------------------
-- Schemas: private and audit are NOT exposed through the Data API.
-- ---------------------------------------------------------------------------
create schema if not exists private;
create schema if not exists audit;

revoke all on schema private from public, anon, authenticated;
revoke all on schema audit from public, anon, authenticated;
-- Functions in public that are security definer still need to resolve private.* as their owner.
grant usage on schema private to postgres, service_role;
grant usage on schema audit to postgres, service_role;

comment on schema private is 'Internal helpers. Never exposed through PostgREST.';
comment on schema audit is 'Append-only audit log. Read only through audited RPCs.';

-- ---------------------------------------------------------------------------
-- Default privileges: nothing is reachable unless a migration grants it explicitly.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Money (BR-01..BR-05). Exact twins of packages/domain-core; both run fixtures/money-cases.json.
-- ---------------------------------------------------------------------------

-- Integer division rounding half away from zero.
create or replace function private.round_half_up_div(p_numerator numeric, p_denominator numeric)
returns bigint
language plpgsql
immutable
strict
set search_path = ''
as $$
begin
  if p_denominator = 0 then
    raise exception 'DS_VALIDATION_FAILED' using errcode = 'P0001', detail = '{"reason":"division_by_zero"}';
  end if;
  return (sign(p_numerator) * sign(p_denominator)
          * floor((abs(p_numerator) * 2 + abs(p_denominator)) / (abs(p_denominator) * 2)))::bigint;
end;
$$;

-- round_half_up(price × qty / 1000); quantity in milli-units.
create or replace function private.line_gross(p_unit_price_paise bigint, p_quantity_milli bigint)
returns bigint
language plpgsql
immutable
strict
set search_path = ''
as $$
begin
  if p_unit_price_paise < 0 or p_quantity_milli <= 0 then
    raise exception 'DS_VALIDATION_FAILED' using errcode = 'P0001', detail = '{"reason":"invalid_line"}';
  end if;
  return private.round_half_up_div(p_unit_price_paise::numeric * p_quantity_milli, 1000);
end;
$$;

-- Tax contained in a tax-inclusive amount: round_half_up(amount × rate / (10000 + rate)).
create or replace function private.tax_from_inclusive(p_amount_paise bigint, p_rate_bp integer)
returns bigint
language sql
immutable
strict
set search_path = ''
as $$
  select case when p_rate_bp = 0 then 0::bigint
              else private.round_half_up_div(p_amount_paise::numeric * p_rate_bp, 10000 + p_rate_bp) end;
$$;

-- Largest-remainder proportional allocation; ties go to the earlier index. Sum equals p_total.
create or replace function private.allocate_proportionally(p_total bigint, p_weights bigint[])
returns bigint[]
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_sum numeric := 0;
  v_result bigint[] := '{}';
  v_leftover bigint;
  v_idx integer;
  v_n integer := coalesce(array_length(p_weights, 1), 0);
begin
  if v_n = 0 then
    return v_result;
  end if;
  select coalesce(sum(w), 0) into v_sum from unnest(p_weights) as w;
  if v_sum = 0 then
    v_result := array_fill(0::bigint, array[v_n]);
    v_result[1] := p_total;
    return v_result;
  end if;

  select array_agg(floor(p_total::numeric * w / v_sum)::bigint order by ord)
    into v_result
    from unnest(p_weights) with ordinality as t(w, ord);

  v_leftover := p_total - (select sum(x) from unnest(v_result) as x);

  for v_idx in
    select ord::integer
      from unnest(p_weights) with ordinality as t(w, ord)
     order by (p_total::numeric * w) % v_sum desc, ord asc
  loop
    exit when v_leftover <= 0;
    v_result[v_idx] := v_result[v_idx] + 1;
    v_leftover := v_leftover - 1;
  end loop;
  return v_result;
end;
$$;

-- Indian financial year code for an instant in a time zone: 2026-04-01 IST → '2627'.
create or replace function private.financial_year(p_instant timestamptz, p_time_zone text default 'Asia/Kolkata')
returns text
language sql
stable
strict
set search_path = ''
as $$
  with local as (select (p_instant at time zone p_time_zone) as ts)
  select lpad((y % 100)::text, 2, '0') || lpad(((y + 1) % 100)::text, 2, '0')
    from (select case when extract(month from ts) >= 4 then extract(year from ts)::int
                      else extract(year from ts)::int - 1 end as y
            from local) s;
$$;

-- ---------------------------------------------------------------------------
-- Audit log (DATABASE_DATA_DICTIONARY.md "Audit"). Append-only.
-- ---------------------------------------------------------------------------
create table audit.events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_kind text not null check (actor_kind in ('shop_user', 'platform_admin', 'system')),
  shop_id uuid,
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  entity_type text,
  entity_id text,
  before jsonb,
  after jsonb,
  reason text,
  request_id text
);
create index audit_events_shop_time on audit.events (shop_id, occurred_at desc);
create index audit_events_actor_time on audit.events (actor_user_id, occurred_at desc);

create or replace function audit.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit.events is append-only' using errcode = '42501';
end;
$$;

create trigger audit_events_append_only
  before update or delete on audit.events
  for each row execute function audit.prevent_mutation();

-- The only way to write an audit event; called by other security definer functions.
create or replace function private.write_audit(
  p_actor_kind text,
  p_action text,
  p_shop_id uuid default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into audit.events (actor_user_id, actor_kind, shop_id, action, entity_type, entity_id, before, after, reason)
  values (auth.uid(), p_actor_kind, p_shop_id, p_action, p_entity_type, p_entity_id, p_before, p_after, p_reason)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on audit.events from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function audit.prevent_mutation() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Platform operators (needed now by the admin guard; managed in Phase 11).
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('super_admin', 'billing_admin', 'onboarding_operator', 'support_agent', 'analyst')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);
alter table public.platform_admins enable row level security;
-- No policies and no grants: rows are invisible to every client role.
-- Rows are created only by the admin-invite-operator Edge Function (service role) in Phase 11.
revoke all on public.platform_admins from anon, authenticated;
comment on table public.platform_admins is 'Platform operator roles. Not readable by clients; see get_my_platform_role().';

-- Active platform role of the caller, or null. Used by admin RPCs (with the aal2 check) and the admin guard.
create or replace function private.current_platform_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pa.role
    from public.platform_admins pa
   where pa.user_id = auth.uid()
     and pa.status = 'active';
$$;

-- True when the caller is an active operator with one of p_roles AND signed in with MFA (aal2).
create or replace function private.is_platform_admin(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_platform_role() = any (p_roles), false)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

revoke execute on function private.current_platform_role() from public, anon, authenticated;
revoke execute on function private.is_platform_admin(text[]) from public, anon, authenticated;

-- Client-callable: lets the admin panel learn the caller's own role (never anyone else's).
create or replace function public.get_my_platform_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_platform_role();
$$;

revoke execute on function public.get_my_platform_role() from public, anon;
grant execute on function public.get_my_platform_role() to authenticated;
comment on function public.get_my_platform_role() is 'Returns the caller''s active platform role or null. Callable by authenticated users only.';
