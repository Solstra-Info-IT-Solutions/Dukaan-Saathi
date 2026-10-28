-- Phase 11: managed onboarding, support tickets, announcements and the operator (admin) RPCs.
-- Operators are platform staff (public.platform_admins). Every admin RPC checks the operator's role AND that they
-- signed in with MFA (aal2); every admin change is audited. Shops never see internal notes or other shops' data.

-- ===========================================================================
-- 1. Operator guard and helpers
-- ===========================================================================
-- Raises unless the caller is an active operator with one of p_roles and signed in with MFA. Returns the role.
create or replace function private.require_platform_role(p_roles text[])
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    perform private.raise_ds('DS_AUTH_REQUIRED');
  end if;
  v_role := private.current_platform_role();
  if v_role is null or not (v_role = any (p_roles)) then
    perform private.raise_ds('DS_PERMISSION_DENIED', jsonb_build_object('platformRoles', to_jsonb(p_roles)));
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    perform private.raise_ds('DS_MFA_REQUIRED');
  end if;
  return v_role;
end;
$$;

-- For storage policies (they run as the signed-in user): operator role + MFA.
create or replace function rls.is_platform_admin(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin(p_roles);
$$;

-- "+91 98XXXXX210": operators see enough to talk to a shop, not the full number in lists.
create or replace function private.mask_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_phone is null then null
              else left(p_phone, 5) || repeat('X', greatest(char_length(p_phone) - 8, 0)) || right(p_phone, 3) end;
$$;

-- ===========================================================================
-- 2. Managed onboarding (features/onboarding-and-support.md)
-- ===========================================================================
create table public.onboarding_requests (
  id uuid primary key,                         -- client-generated, so submitting twice is safe
  shop_id uuid not null references public.shops (id) on delete cascade,
  requested_by uuid not null references auth.users (id),
  method text not null check (method in ('photos', 'spreadsheet', 'call')),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+91[6-9][0-9]{9}$'),
  preferred_time text check (preferred_time is null or char_length(preferred_time) <= 80),
  note text check (note is null or char_length(note) <= 500),
  -- Stored consent; operator commits are not built yet, so the owner always approves in the app (ADR-063).
  operator_may_commit boolean not null default false,
  status text not null default 'new'
    check (status in ('new', 'assigned', 'in_progress', 'awaiting_owner', 'completed', 'cancelled')),
  status_note text check (status_note is null or char_length(status_note) <= 300),
  assigned_to uuid references auth.users (id),
  import_job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id),
  foreign key (shop_id, import_job_id) references public.import_jobs (shop_id, id)
);
create index onboarding_requests_status on public.onboarding_requests (status, created_at);
create index onboarding_requests_shop on public.onboarding_requests (shop_id, created_at desc);
create index onboarding_requests_requested_by on public.onboarding_requests (requested_by);
create index onboarding_requests_assigned_to on public.onboarding_requests (assigned_to);
create index onboarding_requests_job on public.onboarding_requests (shop_id, import_job_id) where import_job_id is not null;
create trigger onboarding_requests_updated_at before update on public.onboarding_requests
  for each row execute function private.set_updated_at();

create table public.onboarding_files (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  request_id uuid not null,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  foreign key (shop_id, request_id) references public.onboarding_requests (shop_id, id) on delete cascade,
  check (storage_path like shop_id::text || '/' || request_id::text || '/%')
);
create index onboarding_files_request on public.onboarding_files (shop_id, request_id);

alter table public.onboarding_requests enable row level security;
alter table public.onboarding_files enable row level security;
create policy onboarding_requests_select on public.onboarding_requests for select to authenticated
  using ((select rls.has_permission(shop_id, 'onboarding.request')));
create policy onboarding_files_select on public.onboarding_files for select to authenticated
  using ((select rls.has_permission(shop_id, 'onboarding.request')));
grant select on public.onboarding_requests, public.onboarding_files to authenticated;

-- Private bucket: shops upload into <shop>/<request>/…; onboarding operators read (signed URLs from the admin panel).
do $$
begin
  if to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('onboarding-files', 'onboarding-files', false, 10485760,
            array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/csv',
                  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
    on conflict (id) do nothing;
    execute $p$create policy onboarding_files_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'onboarding-files'
                  and (select rls.has_permission(rls.shop_of_path(name), 'onboarding.request')))$p$;
    execute $p$create policy onboarding_files_read on storage.objects for select to authenticated
      using (bucket_id = 'onboarding-files'
             and ((select rls.has_permission(rls.shop_of_path(name), 'onboarding.request'))
                  or (select rls.is_platform_admin(array['super_admin', 'onboarding_operator']))))$p$;
  end if;
end;
$$;

create or replace function private.onboarding_json(r public.onboarding_requests)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'shopId', r.shop_id, 'method', r.method, 'contactPhone', r.contact_phone,
    'preferredTime', r.preferred_time, 'note', r.note, 'operatorMayCommit', r.operator_may_commit,
    'status', r.status, 'statusNote', r.status_note, 'importJobId', r.import_job_id,
    'createdAt', r.created_at, 'updatedAt', r.updated_at,
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'path', f.storage_path, 'fileName', f.file_name,
                                                           'mimeType', f.mime_type, 'sizeBytes', f.size_bytes)
                                        order by f.created_at)
                         from public.onboarding_files f where f.shop_id = r.shop_id and f.request_id = r.id), '[]'::jsonb));
$$;

-- Owner (or manager) asks us to set up the catalogue. Entitlement onboarding.managed.
create or replace function public.create_onboarding_request(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid := (p_input ->> 'shopId')::uuid;
  v_id uuid := (p_input ->> 'id')::uuid;
  v_row public.onboarding_requests;
begin
  perform private.require_member(v_shop_id, 'onboarding.request');
  perform private.assert_entitlement(v_shop_id, 'onboarding.managed');
  if v_id is null then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"id"}');
  end if;
  select * into v_row from public.onboarding_requests where id = v_id;
  if v_row.id is not null then
    if v_row.shop_id <> v_shop_id then
      perform private.raise_ds('DS_CONFLICT');
    end if;
    return private.onboarding_json(v_row); -- submitted twice
  end if;
  if exists (select 1 from public.onboarding_requests
              where shop_id = v_shop_id and status in ('new', 'assigned', 'in_progress', 'awaiting_owner')) then
    perform private.raise_ds('DS_CONFLICT', '{"reason":"request_open"}');
  end if;
  begin
    insert into public.onboarding_requests (id, shop_id, requested_by, method, contact_phone, preferred_time, note,
                                            operator_may_commit)
    values (v_id, v_shop_id, auth.uid(), p_input ->> 'method', nullif(p_input ->> 'contactPhone', ''),
            nullif(btrim(p_input ->> 'preferredTime'), ''), nullif(btrim(p_input ->> 'note'), ''),
            coalesce((p_input ->> 'operatorMayCommit')::boolean, false))
    returning * into v_row;
  exception when check_violation or not_null_violation then
    perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('reason', sqlerrm));
  end;
  perform private.write_audit('shop_user', 'onboarding.requested', v_shop_id, 'onboarding_request', v_id::text, null,
    jsonb_build_object('method', v_row.method, 'operatorMayCommit', v_row.operator_may_commit));
  return private.onboarding_json(v_row);
end;
$$;

-- Records a file already uploaded to onboarding-files/<shop>/<request>/… (the upload itself is checked by storage).
create or replace function public.add_onboarding_file(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid := (p_input ->> 'shopId')::uuid;
  v_row public.onboarding_requests;
begin
  perform private.require_member(v_shop_id, 'onboarding.request');
  select * into v_row from public.onboarding_requests
   where shop_id = v_shop_id and id = (p_input ->> 'requestId')::uuid for update;
  if v_row.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  if v_row.status in ('completed', 'cancelled') then
    perform private.raise_ds('DS_CONFLICT', jsonb_build_object('reason', 'request_' || v_row.status));
  end if;
  if (select count(*) from public.onboarding_files where request_id = v_row.id) >= 30 then
    perform private.raise_ds('DS_QUOTA_EXCEEDED', '{"key":"onboarding.files","limit":30}');
  end if;
  begin
    insert into public.onboarding_files (shop_id, request_id, storage_path, file_name, mime_type, size_bytes)
    values (v_shop_id, v_row.id, p_input ->> 'path', left(btrim(p_input ->> 'fileName'), 200), p_input ->> 'mimeType',
            (p_input ->> 'sizeBytes')::integer)
    on conflict (storage_path) do nothing;
  exception when check_violation or not_null_violation then
    perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('reason', sqlerrm));
  end;
  return private.onboarding_json(v_row);
end;
$$;

-- The owner committing the operator's import completes the request.
create or replace function private.complete_onboarding_on_commit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'committed' and old.status <> 'committed' then
    update public.onboarding_requests set status = 'completed', status_note = null
     where shop_id = new.shop_id and import_job_id = new.id and status in ('in_progress', 'awaiting_owner');
  end if;
  return new;
end;
$$;
create trigger import_jobs_complete_onboarding after update of status on public.import_jobs
  for each row execute function private.complete_onboarding_on_commit();

-- An import job of the caller's shop (the owner reviews what an operator prepared).
create or replace function public.get_import_job(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return private.import_job_json(private.require_import_job(p_job_id));
end;
$$;

-- Staging shared by shops (stage_import_rows) and operators (admin_stage_import_rows).
create or replace function private.stage_rows(p_job public.import_jobs, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit jsonb;
  v_total bigint;
begin
  if p_job.status not in ('draft', 'review') then
    perform private.raise_ds('DS_CONFLICT', jsonb_build_object('reason', 'job_' || p_job.status));
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"rows_must_be_array_of_at_most_1000"}');
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x
              where jsonb_typeof(x) <> 'object' or coalesce(x ->> 'rowNumber', '') !~ '^[1-9][0-9]{0,6}$') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"reason":"invalid_row_number"}');
  end if;

  insert into public.import_job_rows (shop_id, job_id, row_number, raw)
  select p_job.shop_id, p_job.id, (x ->> 'rowNumber')::integer,
         jsonb_strip_nulls(jsonb_build_object(
           'name', left(x ->> 'name', 200), 'nameHi', left(x ->> 'nameHi', 200), 'category', left(x ->> 'category', 200),
           'unit', left(x ->> 'unit', 40), 'price', left(x ->> 'price', 40), 'mrp', left(x ->> 'mrp', 40),
           'taxRate', left(x ->> 'taxRate', 20), 'hsn', left(x ->> 'hsn', 20), 'barcode', left(x ->> 'barcode', 80)))
    from jsonb_array_elements(p_rows) x
  on conflict (job_id, row_number) do update set raw = excluded.raw;

  select count(*) into v_total from public.import_job_rows where job_id = p_job.id;
  v_limit := private.resolve_entitlements(p_job.shop_id) -> 'import.rows_per_job';
  if v_limit is not null and jsonb_typeof(v_limit) <> 'null' and v_total > (v_limit #>> '{}')::bigint then
    perform private.raise_ds('DS_QUOTA_EXCEEDED',
      jsonb_build_object('key', 'import.rows_per_job', 'limit', (v_limit #>> '{}')::bigint, 'used', v_total));
  end if;

  update public.import_jobs set status = 'review' where id = p_job.id;
  return private.refresh_import_job(p_job.id);
end;
$$;

create or replace function public.stage_import_rows(p_job_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.stage_rows(private.require_import_job(p_job_id, true), p_rows);
end;
$$;

-- ===========================================================================
-- 3. Support tickets (internal notes never visible to shops)
-- ===========================================================================
create table public.support_tickets (
  id uuid primary key,                         -- client-generated
  shop_id uuid not null references public.shops (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  subject text not null check (char_length(btrim(subject)) between 3 and 120),
  category text not null check (category in ('billing', 'sync', 'catalogue', 'account', 'other')),
  status text not null default 'waiting_support'
    check (status in ('waiting_support', 'waiting_shop', 'resolved', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references auth.users (id),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id)
);
create index support_tickets_queue on public.support_tickets (status, last_message_at desc);
create index support_tickets_shop on public.support_tickets (shop_id, last_message_at desc);
create index support_tickets_created_by on public.support_tickets (created_by);
create index support_tickets_assigned_to on public.support_tickets (assigned_to);
create trigger support_tickets_updated_at before update on public.support_tickets
  for each row execute function private.set_updated_at();

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  ticket_id uuid not null,
  author_id uuid not null references auth.users (id),
  author_kind text not null check (author_kind in ('shop', 'operator')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (shop_id, ticket_id) references public.support_tickets (shop_id, id) on delete cascade,
  check (author_kind = 'operator' or not is_internal)
);
create index support_messages_ticket on public.support_messages (shop_id, ticket_id, created_at);
create index support_messages_author on public.support_messages (author_id);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
-- Members see their own tickets; owners and managers (staff.manage) see the shop's.
create policy support_tickets_select on public.support_tickets for select to authenticated
  using ((select rls.has_permission(shop_id, 'support.create'))
         and (created_by = (select auth.uid()) or (select rls.has_permission(shop_id, 'staff.manage'))));
create policy support_messages_select on public.support_messages for select to authenticated
  using (not is_internal
         and exists (select 1 from public.support_tickets t
                      where t.shop_id = support_messages.shop_id and t.id = support_messages.ticket_id));
grant select on public.support_tickets, public.support_messages to authenticated;

create or replace function public.create_support_ticket(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid := (p_input ->> 'shopId')::uuid;
  v_id uuid := (p_input ->> 'id')::uuid;
  v_row public.support_tickets;
begin
  perform private.require_member(v_shop_id, 'support.create');
  select * into v_row from public.support_tickets where id = v_id;
  if v_row.id is not null then
    if v_row.shop_id <> v_shop_id then
      perform private.raise_ds('DS_CONFLICT');
    end if;
    return jsonb_build_object('id', v_row.id, 'status', v_row.status); -- sent twice
  end if;
  begin
    insert into public.support_tickets (id, shop_id, created_by, subject, category)
    values (v_id, v_shop_id, auth.uid(), btrim(p_input ->> 'subject'), coalesce(p_input ->> 'category', 'other'))
    returning * into v_row;
    insert into public.support_messages (shop_id, ticket_id, author_id, author_kind, body)
    values (v_shop_id, v_id, auth.uid(), 'shop', btrim(p_input ->> 'body'));
  exception when check_violation or not_null_violation then
    perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('reason', sqlerrm));
  end;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status);
end;
$$;

create or replace function public.add_ticket_message(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid := (p_input ->> 'shopId')::uuid;
  v_ticket public.support_tickets;
begin
  perform private.require_member(v_shop_id, 'support.create');
  select * into v_ticket from public.support_tickets
   where shop_id = v_shop_id and id = (p_input ->> 'ticketId')::uuid for update;
  if v_ticket.id is null
     or (v_ticket.created_by <> auth.uid() and not rls.has_permission(v_shop_id, 'staff.manage')) then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  if v_ticket.status = 'closed' then
    perform private.raise_ds('DS_CONFLICT', '{"reason":"ticket_closed"}');
  end if;
  begin
    insert into public.support_messages (shop_id, ticket_id, author_id, author_kind, body)
    values (v_shop_id, v_ticket.id, auth.uid(), 'shop', btrim(p_input ->> 'body'));
  exception when check_violation or not_null_violation then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"body"}');
  end;
  -- A reply from the shop puts the ticket back in our queue (also reopens a resolved one).
  update public.support_tickets set status = 'waiting_support', last_message_at = now() where id = v_ticket.id;
  return jsonb_build_object('id', v_ticket.id, 'status', 'waiting_support');
end;
$$;

-- ===========================================================================
-- 4. Announcements (shown in the app)
-- ===========================================================================
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title jsonb not null check (jsonb_typeof(title) = 'object' and char_length(title ->> 'en') between 1 and 120),
  body jsonb not null default '{}' check (jsonb_typeof(body) = 'object'),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index announcements_live on public.announcements (status, starts_at);
create index announcements_created_by on public.announcements (created_by);
create trigger announcements_updated_at before update on public.announcements
  for each row execute function private.set_updated_at();
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;

create or replace function public.get_announcements()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'severity', a.severity,
                                               'startsAt', a.starts_at, 'endsAt', a.ends_at)
                            order by case a.severity when 'critical' then 0 when 'warning' then 1 else 2 end,
                                     a.starts_at desc nulls last), '[]'::jsonb)
    from public.announcements a
   where auth.uid() is not null and a.status = 'published'
     and (a.starts_at is null or a.starts_at <= now()) and (a.ends_at is null or a.ends_at > now());
$$;

-- ===========================================================================
-- 5. Admin RPCs (ADMIN_PANEL_SPECIFICATION.md §4)
-- ===========================================================================
create or replace function public.admin_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_role(array['super_admin', 'billing_admin', 'onboarding_operator', 'support_agent', 'analyst']);
  return jsonb_build_object(
    'shops', (select count(*) from public.shops where status <> 'closed'),
    'newShops7d', (select count(*) from public.shops where created_at > now() - interval '7 days'),
    'activeShops7d', (select count(distinct shop_id) from public.sales where created_at > now() - interval '7 days'),
    'activeShops30d', (select count(distinct shop_id) from public.sales where created_at > now() - interval '30 days'),
    'suspendedShops', (select count(*) from public.shops where status = 'suspended'),
    'trialsEnding7d', (select count(*) from public.shop_subscriptions
                        where is_current and status = 'trialing' and trial_ends_at between now() and now() + interval '7 days'),
    'pastDue', (select count(*) from public.shop_subscriptions where is_current and status in ('past_due', 'grace')),
    'salesPaise7d', (select coalesce(sum(total_paise), 0) from public.sales
                      where created_at > now() - interval '7 days' and status <> 'voided'),
    'bills7d', (select count(*) from public.sales where created_at > now() - interval '7 days' and status <> 'voided'),
    'needsReview7d', (select count(*) from public.sales where created_at > now() - interval '7 days' and status = 'needs_review'),
    'openTickets', (select count(*) from public.support_tickets where status in ('waiting_support', 'waiting_shop')),
    'ticketsWaitingSupport', (select count(*) from public.support_tickets where status = 'waiting_support'),
    'onboarding', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
                     select status, count(*) as n from public.onboarding_requests
                      where status not in ('completed', 'cancelled') group by status) x));
end;
$$;

-- Shops, newest first; search by name, city or phone digits. Keyset cursor "createdAt|id".
create or replace function public.admin_list_shops(p_query text default null, p_status text default null,
                                                   p_cursor text default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(lower(btrim(p_query)), '');
  v_digits text := nullif(regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g'), '');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_at timestamptz := nullif(split_part(coalesce(p_cursor, ''), '|', 1), '')::timestamptz;
  v_id uuid := nullif(split_part(coalesce(p_cursor, ''), '|', 2), '')::uuid;
  v_rows jsonb;
begin
  perform private.require_platform_role(array['super_admin', 'billing_admin', 'onboarding_operator', 'support_agent', 'analyst']);
  select coalesce(jsonb_agg(r.item order by r.created_at desc, r.id desc), '[]'::jsonb) into v_rows
    from (
      select s.created_at, s.id, jsonb_build_object(
               'shopId', s.id, 'name', s.name, 'city', s.city, 'status', s.status, 'createdAt', s.created_at,
               'phone', private.mask_phone(s.phone_e164),
               'plan', (select sp.code from public.shop_subscriptions ss join public.subscription_plans sp on sp.id = ss.plan_id
                         where ss.shop_id = s.id and ss.is_current),
               'subscriptionStatus', (select ss.status from public.shop_subscriptions ss where ss.shop_id = s.id and ss.is_current),
               'lastSaleAt', (select max(created_at) from public.sales where shop_id = s.id)) as item
        from public.shops s
       where (p_status is null or s.status = p_status)
         and (v_q is null or lower(s.name) like '%' || v_q || '%' or lower(coalesce(s.city, '')) like '%' || v_q || '%'
              or (v_digits is not null and char_length(v_digits) >= 4 and s.phone_e164 like '%' || v_digits || '%'))
         and (v_at is null or (s.created_at, s.id) < (v_at, v_id))
       order by s.created_at desc, s.id desc
       limit v_limit) r;
  return jsonb_build_object('items', v_rows,
    'nextCursor', case when jsonb_array_length(v_rows) = v_limit
                       then (v_rows -> -1 ->> 'createdAt') || '|' || (v_rows -> -1 ->> 'shopId') end);
end;
$$;

-- One shop for support and onboarding: overview, plan, members (masked), devices, usage, requests, tickets. Audited.
create or replace function public.admin_get_shop(p_shop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop public.shops;
begin
  perform private.require_platform_role(array['super_admin', 'billing_admin', 'onboarding_operator', 'support_agent', 'analyst']);
  select * into v_shop from public.shops where id = p_shop_id;
  if v_shop.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  perform private.write_audit('platform_admin', 'admin.shop_viewed', p_shop_id, 'shop', p_shop_id::text);
  return jsonb_build_object(
    'shop', jsonb_build_object('shopId', v_shop.id, 'name', v_shop.name, 'status', v_shop.status, 'city', v_shop.city,
                               'businessCategory', v_shop.business_category, 'phone', private.mask_phone(v_shop.phone_e164),
                               'createdAt', v_shop.created_at),
    'subscription', (select jsonb_build_object('plan', sp.code, 'status', ss.status, 'trialEndsAt', ss.trial_ends_at,
                                               'currentPeriodEnd', ss.current_period_end)
                       from public.shop_subscriptions ss join public.subscription_plans sp on sp.id = ss.plan_id
                      where ss.shop_id = p_shop_id and ss.is_current),
    'members', coalesce((select jsonb_agg(jsonb_build_object('userId', m.user_id, 'role', m.role, 'status', m.status,
                                                             'name', p.display_name, 'phone', private.mask_phone(p.phone_e164),
                                                             'joinedAt', m.joined_at) order by m.role, m.joined_at)
                           from public.shop_members m left join public.profiles p on p.id = m.user_id
                          where m.shop_id = p_shop_id), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('deviceId', d.id, 'code', d.device_code, 'platform', d.platform,
                                                             'status', d.status, 'appVersion', d.app_version,
                                                             'lastSeenAt', d.last_seen_at) order by d.device_code)
                           from public.shop_devices d where d.shop_id = p_shop_id), '[]'::jsonb),
    'usage', jsonb_build_object(
      'products', (select count(*) from public.products where shop_id = p_shop_id and archived_at is null),
      'customers', (select count(*) from public.customers where shop_id = p_shop_id and archived_at is null),
      'bills30d', (select count(*) from public.sales where shop_id = p_shop_id and created_at > now() - interval '30 days'),
      'needsReview30d', (select count(*) from public.sales where shop_id = p_shop_id and status = 'needs_review'
                           and created_at > now() - interval '30 days'),
      'lastSaleAt', (select max(created_at) from public.sales where shop_id = p_shop_id)),
    'onboarding', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status, 'method', r.method,
                                                                'createdAt', r.created_at) order by r.created_at desc)
                              from public.onboarding_requests r where r.shop_id = p_shop_id), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'subject', t.subject, 'status', t.status,
                                                             'lastMessageAt', t.last_message_at) order by t.last_message_at desc)
                           from public.support_tickets t where t.shop_id = p_shop_id), '[]'::jsonb));
end;
$$;

-- Suspend (with a reason) or reactivate a shop. Suspended shops cannot sign in to it (require_member).
create or replace function public.admin_set_shop_status(p_shop_id uuid, p_status text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop public.shops;
begin
  perform private.require_platform_role(array['super_admin', 'billing_admin']);
  if p_status not in ('active', 'suspended') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"status"}');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"reason"}');
  end if;
  select * into v_shop from public.shops where id = p_shop_id for update;
  if v_shop.id is null or v_shop.status = 'closed' then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  update public.shops set status = p_status where id = p_shop_id;
  perform private.write_audit('platform_admin', 'admin.shop_status_changed', p_shop_id, 'shop', p_shop_id::text,
    jsonb_build_object('status', v_shop.status), jsonb_build_object('status', p_status), btrim(p_reason));
  return jsonb_build_object('shopId', p_shop_id, 'status', p_status);
end;
$$;

-- Support can deactivate a member (lost phone, staff left) or revoke a device; never the owner.
create or replace function public.admin_deactivate_member(p_shop_id uuid, p_user_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.shop_members;
begin
  perform private.require_platform_role(array['super_admin', 'support_agent']);
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"reason"}');
  end if;
  select * into v_member from public.shop_members where shop_id = p_shop_id and user_id = p_user_id for update;
  if v_member.user_id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  if v_member.role = 'owner' then
    perform private.raise_ds('DS_CONFLICT', '{"reason":"owner"}');
  end if;
  update public.shop_members set status = 'deactivated' where shop_id = p_shop_id and user_id = p_user_id;
  perform private.write_audit('platform_admin', 'admin.member_deactivated', p_shop_id, 'shop_member', p_user_id::text,
    jsonb_build_object('status', v_member.status), jsonb_build_object('status', 'deactivated'), btrim(p_reason));
  return jsonb_build_object('userId', p_user_id, 'status', 'deactivated');
end;
$$;

create or replace function public.admin_revoke_device(p_shop_id uuid, p_device_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_role(array['super_admin', 'support_agent']);
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"reason"}');
  end if;
  update public.shop_devices set status = 'revoked' where shop_id = p_shop_id and id = p_device_id and status = 'active';
  if not found then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  perform private.write_audit('platform_admin', 'admin.device_revoked', p_shop_id, 'shop_device', p_device_id::text,
    jsonb_build_object('status', 'active'), jsonb_build_object('status', 'revoked'), btrim(p_reason));
  return jsonb_build_object('deviceId', p_device_id, 'status', 'revoked');
end;
$$;

-- Onboarding queue and workbench (super_admin, onboarding_operator)
create or replace function public.admin_list_onboarding(p_status text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_role(array['super_admin', 'onboarding_operator']);
  return coalesce((
    select jsonb_agg(private.onboarding_json(r) || jsonb_build_object(
             'shopName', s.name, 'city', s.city, 'assignedToEmail', u.email) order by r.created_at)
      from public.onboarding_requests r
      join public.shops s on s.id = r.shop_id
      left join auth.users u on u.id = r.assigned_to
     where (p_status is null and r.status not in ('completed', 'cancelled')) or r.status = p_status), '[]'::jsonb);
end;
$$;

create or replace function public.admin_get_onboarding(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.onboarding_requests;
begin
  perform private.require_platform_role(array['super_admin', 'onboarding_operator']);
  select * into v_row from public.onboarding_requests where id = p_id;
  if v_row.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  return private.onboarding_json(v_row) || jsonb_build_object(
    'shopName', (select name from public.shops where id = v_row.shop_id),
    'assignedToEmail', (select email from auth.users where id = v_row.assigned_to),
    'importJob', (select private.import_job_json(j) from public.import_jobs j
                   where j.shop_id = v_row.shop_id and j.id = v_row.import_job_id));
end;
$$;

-- Allowed status steps (features/onboarding-and-support.md state machine). Completion happens when the owner commits.
create or replace function public.admin_update_onboarding(p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.onboarding_requests;
  v_next text := p_patch ->> 'status';
  v_assign text := p_patch ->> 'assignTo';
  v_allowed jsonb := '{"new":["assigned","cancelled"],"assigned":["in_progress","new","cancelled"],
                       "in_progress":["awaiting_owner","cancelled"],"awaiting_owner":["in_progress"]}';
  v_job public.import_jobs;
begin
  perform private.require_platform_role(array['super_admin', 'onboarding_operator']);
  select * into v_row from public.onboarding_requests where id = p_id for update;
  if v_row.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  if v_next is not null and v_next <> v_row.status
     and not coalesce(v_allowed -> v_row.status ? v_next, false) then
    perform private.raise_ds('DS_CONFLICT', jsonb_build_object('reason', 'status_step', 'from', v_row.status, 'to', v_next));
  end if;
  if v_next = 'awaiting_owner' then
    select * into v_job from public.import_jobs where shop_id = v_row.shop_id and id = v_row.import_job_id;
    if v_job.id is null or v_job.status <> 'review' or v_job.valid_count = 0 then
      perform private.raise_ds('DS_CONFLICT', '{"reason":"import_not_ready"}');
    end if;
  end if;
  update public.onboarding_requests
     set status = coalesce(v_next, status),
         assigned_to = case when v_assign = 'me' then auth.uid() when v_assign = 'none' then null else assigned_to end,
         status_note = case when p_patch ? 'statusNote' then nullif(btrim(p_patch ->> 'statusNote'), '') else status_note end
   where id = p_id
  returning * into v_row;
  if v_row.status = 'assigned' and v_row.assigned_to is null then
    update public.onboarding_requests set assigned_to = auth.uid() where id = p_id returning * into v_row;
  end if;
  perform private.write_audit('platform_admin', 'admin.onboarding_updated', v_row.shop_id, 'onboarding_request', p_id::text,
    null, p_patch);
  return private.onboarding_json(v_row);
end;
$$;

-- Creates (once) the shop's import job for this request; the operator then stages rows into it.
create or replace function public.admin_create_import_job(p_onboarding_id uuid, p_file_name text, p_client_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.onboarding_requests;
  v_job public.import_jobs;
begin
  perform private.require_platform_role(array['super_admin', 'onboarding_operator']);
  select * into v_row from public.onboarding_requests where id = p_onboarding_id for update;
  if v_row.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  if v_row.status not in ('assigned', 'in_progress') then
    perform private.raise_ds('DS_CONFLICT', jsonb_build_object('reason', 'request_' || v_row.status));
  end if;
  select * into v_job from public.import_jobs where shop_id = v_row.shop_id and id = v_row.import_job_id;
  if v_job.id is null or v_job.status in ('committed', 'cancelled') then
    select * into v_job from public.import_jobs where shop_id = v_row.shop_id and client_operation_id = p_client_operation_id;
    if v_job.id is null then
      insert into public.import_jobs (shop_id, file_name, client_operation_id, created_by)
      values (v_row.shop_id, left(btrim(coalesce(p_file_name, 'onboarding.csv')), 200), p_client_operation_id, auth.uid())
      returning * into v_job;
    end if;
    update public.onboarding_requests set import_job_id = v_job.id, status = 'in_progress' where id = v_row.id;
    perform private.write_audit('platform_admin', 'admin.import_created', v_row.shop_id, 'import_job', v_job.id::text,
      null, jsonb_build_object('onboardingId', v_row.id, 'fileName', v_job.file_name));
  end if;
  return private.import_job_json(v_job);
end;
$$;

create or replace function public.admin_stage_import_rows(p_onboarding_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.import_jobs;
begin
  perform private.require_platform_role(array['super_admin', 'onboarding_operator']);
  select j.* into v_job from public.onboarding_requests r
    join public.import_jobs j on j.shop_id = r.shop_id and j.id = r.import_job_id
   where r.id = p_onboarding_id and r.status = 'in_progress'
     for update of j;
  if v_job.id is null then
    perform private.raise_ds('DS_CONFLICT', '{"reason":"no_open_import"}');
  end if;
  return private.stage_rows(v_job, p_rows);
end;
$$;

-- Support queue (super_admin, support_agent)
create or replace function public.admin_list_tickets(p_status text default null, p_query text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(lower(btrim(p_query)), '');
begin
  perform private.require_platform_role(array['super_admin', 'support_agent']);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'shopId', t.shop_id, 'shopName', s.name, 'subject', t.subject,
                                        'category', t.category, 'status', t.status, 'priority', t.priority,
                                        'assignedToEmail', u.email, 'lastMessageAt', t.last_message_at)
                     order by case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
                              t.last_message_at)
      from public.support_tickets t
      join public.shops s on s.id = t.shop_id
      left join auth.users u on u.id = t.assigned_to
     where ((p_status is null and t.status in ('waiting_support', 'waiting_shop')) or t.status = p_status)
       and (v_q is null or lower(t.subject) like '%' || v_q || '%' or lower(s.name) like '%' || v_q || '%')), '[]'::jsonb);
end;
$$;

create or replace function public.admin_get_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_t public.support_tickets;
begin
  perform private.require_platform_role(array['super_admin', 'support_agent']);
  select * into v_t from public.support_tickets where id = p_ticket_id;
  if v_t.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  return jsonb_build_object(
    'id', v_t.id, 'shopId', v_t.shop_id, 'shopName', (select name from public.shops where id = v_t.shop_id),
    'subject', v_t.subject, 'category', v_t.category, 'status', v_t.status, 'priority', v_t.priority,
    'assignedToEmail', (select email from auth.users where id = v_t.assigned_to), 'createdAt', v_t.created_at,
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', m.id, 'authorKind', m.author_kind, 'isInternal', m.is_internal, 'body', m.body,
                             'createdAt', m.created_at,
                             'author', case when m.author_kind = 'operator' then (select email from auth.users where id = m.author_id)
                                            else (select display_name from public.profiles where id = m.author_id) end)
                           order by m.created_at, m.id)
                            from public.support_messages m where m.ticket_id = v_t.id), '[]'::jsonb));
end;
$$;

-- Reply to the shop, or an internal note (never shown to the shop).
create or replace function public.admin_reply_ticket(p_ticket_id uuid, p_body text, p_internal boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.support_tickets;
begin
  perform private.require_platform_role(array['super_admin', 'support_agent']);
  select * into v_t from public.support_tickets where id = p_ticket_id for update;
  if v_t.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  begin
    insert into public.support_messages (shop_id, ticket_id, author_id, author_kind, body, is_internal)
    values (v_t.shop_id, v_t.id, auth.uid(), 'operator', btrim(p_body), coalesce(p_internal, false));
  exception when check_violation or not_null_violation then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"body"}');
  end;
  if not coalesce(p_internal, false) then
    update public.support_tickets
       set status = case when status = 'closed' then status else 'waiting_shop' end, last_message_at = now(),
           assigned_to = coalesce(assigned_to, auth.uid())
     where id = v_t.id;
  end if;
  perform private.write_audit('platform_admin', 'admin.ticket_updated', v_t.shop_id, 'support_ticket', v_t.id::text,
    null, jsonb_build_object('reply', true, 'internal', coalesce(p_internal, false)));
  return public.admin_get_ticket(p_ticket_id);
end;
$$;

create or replace function public.admin_update_ticket(p_ticket_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.support_tickets;
begin
  perform private.require_platform_role(array['super_admin', 'support_agent']);
  select * into v_t from public.support_tickets where id = p_ticket_id for update;
  if v_t.id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  begin
    update public.support_tickets
       set status = coalesce(p_patch ->> 'status', status),
           priority = coalesce(p_patch ->> 'priority', priority),
           assigned_to = case p_patch ->> 'assignTo' when 'me' then auth.uid() when 'none' then null else assigned_to end
     where id = p_ticket_id;
  exception when check_violation then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"patch"}');
  end;
  perform private.write_audit('platform_admin', 'admin.ticket_updated', v_t.shop_id, 'support_ticket', v_t.id::text,
    jsonb_build_object('status', v_t.status, 'priority', v_t.priority), p_patch);
  return public.admin_get_ticket(p_ticket_id);
end;
$$;

-- Audit log (super_admin). Newest first; cursor = last id.
create or replace function public.admin_list_audit_log(p_shop_id uuid default null, p_action text default null,
                                                       p_actor_kind text default null, p_before_id bigint default null,
                                                       p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  perform private.require_platform_role(array['super_admin']);
  select coalesce(jsonb_agg(x.item order by x.id desc), '[]'::jsonb) into v_rows
    from (select e.id, jsonb_build_object('id', e.id, 'occurredAt', e.occurred_at, 'actorKind', e.actor_kind,
                                          'actor', coalesce(u.email, private.mask_phone(u.phone)), 'shopId', e.shop_id,
                                          'shopName', s.name, 'action', e.action, 'entityType', e.entity_type,
                                          'entityId', e.entity_id, 'before', e.before, 'after', e.after, 'reason', e.reason) as item
            from audit.events e
            left join auth.users u on u.id = e.actor_user_id
            left join public.shops s on s.id = e.shop_id
           where (p_shop_id is null or e.shop_id = p_shop_id)
             and (p_action is null or e.action like p_action || '%')
             and (p_actor_kind is null or e.actor_kind = p_actor_kind)
             and (p_before_id is null or e.id < p_before_id)
           order by e.id desc
           limit v_limit) x;
  return jsonb_build_object('items', v_rows,
    'nextBeforeId', case when jsonb_array_length(v_rows) = v_limit then (v_rows -> -1 ->> 'id')::bigint end);
end;
$$;

-- Announcements (super_admin, support_agent)
create or replace function public.admin_list_announcements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_role(array['super_admin', 'support_agent']);
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'severity', a.severity,
                                                       'status', a.status, 'startsAt', a.starts_at, 'endsAt', a.ends_at,
                                                       'updatedAt', a.updated_at) order by a.created_at desc)
                     from public.announcements a where a.status <> 'archived'), '[]'::jsonb);
end;
$$;

create or replace function public.admin_save_announcement(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := (p_input ->> 'id')::uuid;
  v_row public.announcements;
  v_before public.announcements;
begin
  perform private.require_platform_role(array['super_admin', 'support_agent']);
  -- A critical announcement reaches every shop: super_admin only.
  if p_input ->> 'severity' = 'critical' and p_input ->> 'status' = 'published' then
    perform private.require_platform_role(array['super_admin']);
  end if;
  begin
    if v_id is null then
      insert into public.announcements (title, body, severity, status, starts_at, ends_at, created_by)
      values (p_input -> 'title', coalesce(p_input -> 'body', '{}'), coalesce(p_input ->> 'severity', 'info'),
              coalesce(p_input ->> 'status', 'draft'), (p_input ->> 'startsAt')::timestamptz, (p_input ->> 'endsAt')::timestamptz,
              auth.uid())
      returning * into v_row;
    else
      select * into v_before from public.announcements where id = v_id for update;
      if v_before.id is null then
        perform private.raise_ds('DS_NOT_FOUND');
      end if;
      update public.announcements
         set title = coalesce(p_input -> 'title', title), body = coalesce(p_input -> 'body', body),
             severity = coalesce(p_input ->> 'severity', severity), status = coalesce(p_input ->> 'status', status),
             starts_at = case when p_input ? 'startsAt' then (p_input ->> 'startsAt')::timestamptz else starts_at end,
             ends_at = case when p_input ? 'endsAt' then (p_input ->> 'endsAt')::timestamptz else ends_at end
       where id = v_id
      returning * into v_row;
    end if;
  exception when check_violation or not_null_violation or invalid_datetime_format then
    perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('reason', sqlerrm));
  end;
  perform private.write_audit('platform_admin', 'admin.content_changed', null, 'announcement', v_row.id::text,
    case when v_before.id is null then null else jsonb_build_object('status', v_before.status) end,
    jsonb_build_object('status', v_row.status, 'severity', v_row.severity, 'title', v_row.title ->> 'en'));
  return jsonb_build_object('id', v_row.id, 'status', v_row.status);
end;
$$;

-- Operators (super_admin). New operators are invited by the admin-invite-operator Edge Function.
create or replace function public.admin_list_operators()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_role(array['super_admin']);
  return coalesce((select jsonb_agg(jsonb_build_object('userId', pa.user_id, 'email', u.email, 'role', pa.role,
                                                       'status', pa.status, 'createdAt', pa.created_at,
                                                       'mfaEnrolled', exists (select 1 from auth.mfa_factors f
                                                                               where f.user_id = pa.user_id and f.status = 'verified'))
                                    order by pa.created_at)
                     from public.platform_admins pa join auth.users u on u.id = pa.user_id), '[]'::jsonb);
end;
$$;

create or replace function public.admin_set_operator_role(p_user_id uuid, p_role text, p_status text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.platform_admins;
begin
  perform private.require_platform_role(array['super_admin']);
  if p_user_id = auth.uid() then
    perform private.raise_ds('DS_CONFLICT', '{"reason":"self"}'); -- no locking oneself out
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"reason"}');
  end if;
  select * into v_before from public.platform_admins where user_id = p_user_id for update;
  if v_before.user_id is null then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  begin
    update public.platform_admins set role = coalesce(p_role, role), status = coalesce(p_status, status), updated_at = now()
     where user_id = p_user_id;
  exception when check_violation then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"role"}');
  end;
  perform private.write_audit('platform_admin', 'admin.operator_changed', null, 'platform_admin', p_user_id::text,
    jsonb_build_object('role', v_before.role, 'status', v_before.status),
    jsonb_build_object('role', coalesce(p_role, v_before.role), 'status', coalesce(p_status, v_before.status)), btrim(p_reason));
  return jsonb_build_object('userId', p_user_id, 'role', coalesce(p_role, v_before.role), 'status', coalesce(p_status, v_before.status));
end;
$$;

-- ===========================================================================
-- 6. Grants
-- ===========================================================================
revoke execute on function private.require_platform_role(text[]) from public, anon, authenticated;
revoke execute on function private.mask_phone(text) from public, anon, authenticated;
revoke execute on function private.onboarding_json(public.onboarding_requests) from public, anon, authenticated;
revoke execute on function private.stage_rows(public.import_jobs, jsonb) from public, anon, authenticated;
revoke execute on function private.complete_onboarding_on_commit() from public, anon, authenticated;
revoke execute on function rls.is_platform_admin(text[]) from public, anon;
grant execute on function rls.is_platform_admin(text[]) to authenticated;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_onboarding_request(jsonb)',
    'public.add_onboarding_file(jsonb)',
    'public.get_import_job(uuid)',
    'public.create_support_ticket(jsonb)',
    'public.add_ticket_message(jsonb)',
    'public.get_announcements()',
    'public.admin_dashboard_metrics()',
    'public.admin_list_shops(text, text, text, integer)',
    'public.admin_get_shop(uuid)',
    'public.admin_set_shop_status(uuid, text, text)',
    'public.admin_deactivate_member(uuid, uuid, text)',
    'public.admin_revoke_device(uuid, uuid, text)',
    'public.admin_list_onboarding(text)',
    'public.admin_get_onboarding(uuid)',
    'public.admin_update_onboarding(uuid, jsonb)',
    'public.admin_create_import_job(uuid, text, uuid)',
    'public.admin_stage_import_rows(uuid, jsonb)',
    'public.admin_list_tickets(text, text)',
    'public.admin_get_ticket(uuid)',
    'public.admin_reply_ticket(uuid, text, boolean)',
    'public.admin_update_ticket(uuid, jsonb)',
    'public.admin_list_audit_log(uuid, text, text, bigint, integer)',
    'public.admin_list_announcements()',
    'public.admin_save_announcement(jsonb)',
    'public.admin_list_operators()',
    'public.admin_set_operator_role(uuid, text, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
