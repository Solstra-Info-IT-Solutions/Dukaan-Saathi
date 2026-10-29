-- Phase 13 hardening: one pre-request gate for every API call (minimum app version, maintenance write block, rate
-- limits), retention jobs, and a system-health view for operators. SECURITY_MODEL.md §10–11, FEATURE_CONFIGURATION.md §8.

-- ===========================================================================
-- 1. Rate limits (fixed windows per user and operation)
-- ===========================================================================
create table private.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (key, window_start)
);

-- Counts one call of `p_key` in the current window; over `p_max` → DS_RATE_LIMITED (retryable after the window).
create or replace function private.rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into private.rate_limits (key, window_start) values (p_key, v_window)
  on conflict (key, window_start) do update set hits = private.rate_limits.hits + 1
  returning hits into v_hits;
  if v_hits > p_max then
    perform private.raise_ds('DS_RATE_LIMITED', jsonb_build_object('retryAfterSeconds',
      ceil(extract(epoch from v_window + make_interval(secs => p_window_seconds) - now()))::integer));
  end if;
end;
$$;

-- Limits per signed-in user for operations that are expensive or reach our team (SECURITY_MODEL.md §11).
create table private.rate_limit_rules (
  rpc text primary key,
  max_calls integer not null check (max_calls > 0),
  window_seconds integer not null check (window_seconds between 60 and 86400)
);
insert into private.rate_limit_rules (rpc, max_calls, window_seconds) values
  ('create_shop', 10, 86400),
  ('invite_shop_member', 30, 3600),
  ('create_import_job', 30, 3600),
  ('stage_import_rows', 400, 3600),
  ('create_onboarding_request', 5, 86400),
  ('add_onboarding_file', 120, 3600),
  ('create_support_ticket', 10, 3600),
  ('add_ticket_message', 60, 3600),
  ('add_product_alias', 300, 3600),
  ('begin_report_export', 30, 3600);

-- ===========================================================================
-- 2. Pre-request gate (PostgREST db_pre_request; runs before every API request, in its transaction)
-- ===========================================================================
-- RPC names that only read. During maintenance with blocksWrites, every other RPC is refused, except operators'.
create or replace function private.is_read_rpc(p_rpc text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_rpc ~ '^(get|list|search)_' or p_rpc = 'sync_pull';
$$;

-- 1. A phone that sends `x-ds-app-version` older than `app.min_supported_version` may only fetch the config (to show
--    the update screen) and push already-recorded offline work (`sync_push`, never lost) → DS_APP_VERSION_UNSUPPORTED.
-- 2. Maintenance with blocksWrites: write RPCs → DS_MAINTENANCE (admin_* stays open so operators can end it).
-- 3. Rate limits per user for the RPCs in private.rate_limit_rules.
-- Table reads (GET) and anything that is not /rpc/ pass untouched; the function is cheap when nothing applies.
create or replace function public.check_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text := coalesce(current_setting('request.path', true), '');
  v_method text := coalesce(current_setting('request.method', true), '');
  v_rpc text;
  v_headers jsonb;
  v_version text;
  v_min text;
  v_maintenance jsonb;
  v_rule private.rate_limit_rules;
begin
  if v_method <> 'POST' or v_path !~ '^/rpc/' then
    return;
  end if;
  v_rpc := substring(v_path from 6);
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;

  v_version := v_headers ->> 'x-ds-app-version';
  if v_version is not null and v_rpc not in ('get_client_config', 'sync_push') then
    select value #>> '{}' into v_min from public.platform_config where key = 'app.min_supported_version';
    if v_min is not null and private.semver_lt(v_version, v_min) then
      perform private.raise_ds('DS_APP_VERSION_UNSUPPORTED', jsonb_build_object('minSupportedAppVersion', v_min));
    end if;
  end if;

  if v_rpc !~ '^admin_' and not private.is_read_rpc(v_rpc) then
    select value into v_maintenance from public.platform_config where key = 'maintenance';
    if coalesce((v_maintenance ->> 'active')::boolean, false) and coalesce((v_maintenance ->> 'blocksWrites')::boolean, false) then
      perform private.raise_ds('DS_MAINTENANCE', jsonb_build_object('message', v_maintenance -> 'message'));
    end if;
  end if;

  select * into v_rule from private.rate_limit_rules where rpc = v_rpc;
  if v_rule.rpc is not null and auth.uid() is not null then
    perform private.rate_limit(auth.uid()::text || ':' || v_rpc, v_rule.max_calls, v_rule.window_seconds);
  end if;
end;
$$;

-- Callable by every API role (PostgREST runs it as the request's role); it only ever raises or returns.
revoke execute on function public.check_request() from public;
grant execute on function public.check_request() to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    alter role authenticator set pgrst.db_pre_request = 'public.check_request';
    notify pgrst, 'reload config';
  end if;
end;
$$;

-- ===========================================================================
-- 3. Retention (SECURITY_MODEL.md §10; defaults pending legal review OD-12)
-- ===========================================================================
-- Daily: import staging rows of finished jobs after 30 days; idempotency records after 180 days (longer than any
-- phone stays offline); rate-limit windows after 2 days. Financial records and audit events are kept (8 years).
create or replace function private.run_retention(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
  v_idem integer;
  v_rate integer;
begin
  delete from public.import_job_rows r
   using public.import_jobs j
   where j.shop_id = r.shop_id and j.id = r.job_id
     and j.status in ('committed', 'cancelled') and coalesce(j.committed_at, j.created_at) < p_now - interval '30 days';
  get diagnostics v_rows = row_count;
  delete from private.idempotency_keys where created_at < p_now - interval '180 days';
  get diagnostics v_idem = row_count;
  delete from private.rate_limits where window_start < p_now - interval '2 days';
  get diagnostics v_rate = row_count;
  if v_rows + v_idem > 0 then
    perform private.write_audit('system', 'retention.run', null, null, null, null,
      jsonb_build_object('importRows', v_rows, 'idempotencyKeys', v_idem, 'rateLimitWindows', v_rate));
  end if;
  return jsonb_build_object('importRows', v_rows, 'idempotencyKeys', v_idem, 'rateLimitWindows', v_rate);
end;
$$;

-- ===========================================================================
-- 4. System health for operators (BL-1308): what needs attention now
-- ===========================================================================
create or replace function public.admin_system_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cron jsonb := '[]'::jsonb;
begin
  perform private.require_platform_role(array['super_admin', 'support_agent', 'analyst']);
  if to_regclass('cron.job_run_details') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object('job', j.jobname, 'lastRunAt', d.start_time, 'status', d.status,
                                                   'message', left(d.return_message, 200)) order by j.jobname), '[]'::jsonb)
        from cron.job j
        left join lateral (select * from cron.job_run_details r where r.jobid = j.jobid
                            order by r.start_time desc limit 1) d on true
    $q$ into v_cron;
  end if;
  return jsonb_build_object(
    'checkedAt', now(),
    'jobs', v_cron,
    'salesNeedsReview', (select count(*) from public.sales where status = 'needs_review'),
    'ticketsWaitingOver24h', (select count(*) from public.support_tickets
                               where status = 'waiting_support' and last_message_at < now() - interval '24 hours'),
    'onboardingNewOver24h', (select count(*) from public.onboarding_requests
                              where status = 'new' and created_at < now() - interval '24 hours'),
    'paymentEvents24h', (select count(*) from public.subscription_events where received_at > now() - interval '24 hours'),
    'shopsPastDueOrGrace', (select count(*) from public.shop_subscriptions
                             where is_current and status in ('past_due', 'grace')),
    'rateLimitReached1h', (select count(*) from private.rate_limits r
                       join private.rate_limit_rules l on r.key like '%:' || l.rpc
                      where r.window_start > now() - interval '1 hour' and r.hits >= l.max_calls),
    'maintenance', (select value from public.platform_config where key = 'maintenance')
  );
end;
$$;

-- ===========================================================================
-- 5. Indexes for the retention job and the health view (the advisor reports no missing foreign-key indexes)
-- ===========================================================================
create index if not exists sales_shop_status on public.sales (shop_id, status);
create index if not exists import_jobs_status_created on public.import_jobs (status, created_at);
create index if not exists idempotency_keys_created on private.idempotency_keys (created_at);

-- ===========================================================================
-- 6. Schedule and grants
-- ===========================================================================
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('retention', '15 1 * * *', 'select private.run_retention()');
  end if;
end;
$$;

revoke all on private.rate_limits, private.rate_limit_rules from public, anon, authenticated;
revoke execute on function private.rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function private.is_read_rpc(text) from public, anon, authenticated;
revoke execute on function private.run_retention(timestamptz) from public, anon, authenticated;
revoke execute on function public.admin_system_health() from public, anon;
grant execute on function public.admin_system_health() to authenticated;
