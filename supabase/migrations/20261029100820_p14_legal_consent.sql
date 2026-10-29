-- Phase 14: privacy policy and terms (BL-1403). The documents live on the web (URLs in platform config `legal`);
-- every user accepts the current version once in the app; the acceptance is stored and audited.

alter table public.profiles
  add column terms_version text check (terms_version is null or char_length(terms_version) <= 40),
  add column terms_accepted_at timestamptz;

insert into public.platform_config (key, value)
values ('legal', '{"version": null, "privacyUrl": null, "termsUrl": null}')
on conflict (key) do nothing;
insert into public.config_revisions (kind, key, revision, value)
select 'platform_config', key, revision, value from public.platform_config where key = 'legal'
on conflict do nothing;

-- Known platform config keys and their shapes (FEATURE_CONFIGURATION.md §6); `legal` added.
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
  https_url constant text := '^https://[^\s]{4,250}$';
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
    -- Either nothing published yet (all null), or a version with both https links.
    when 'legal' then jsonb_typeof(p_value) = 'object'
                      and ((coalesce(jsonb_typeof(p_value -> 'version'), 'null') = 'null'
                            and coalesce(jsonb_typeof(p_value -> 'privacyUrl'), 'null') = 'null'
                            and coalesce(jsonb_typeof(p_value -> 'termsUrl'), 'null') = 'null')
                           or ((p_value ->> 'version') ~ '^[0-9A-Za-z.-]{1,40}$'
                               and (p_value ->> 'privacyUrl') ~ https_url
                               and (p_value ->> 'termsUrl') ~ https_url))
    else false
  end;
  if not coalesce(v_ok, false) then
    perform private.raise_ds('DS_VALIDATION_FAILED', jsonb_build_object('field', 'value', 'key', p_key));
  end if;
end;
$$;

-- Public app configuration (callable before sign-in); now with the legal links.
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
    'legal', (select value from public.platform_config where key = 'legal' and value ->> 'version' is not null),
    'flags', '{}'::jsonb,
    'announcements', '[]'::jsonb,
    'content', '{}'::jsonb
  ));
$$;

-- What the signed-in user accepted, and what is current.
create or replace function public.get_my_consent()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_legal jsonb := (select value from public.platform_config where key = 'legal');
begin
  if auth.uid() is null then
    perform private.raise_ds('DS_AUTH_REQUIRED');
  end if;
  return jsonb_build_object(
    'currentVersion', v_legal ->> 'version',
    'acceptedVersion', (select terms_version from public.profiles where id = auth.uid()),
    'acceptedAt', (select terms_accepted_at from public.profiles where id = auth.uid()),
    'privacyUrl', v_legal ->> 'privacyUrl',
    'termsUrl', v_legal ->> 'termsUrl');
end;
$$;

-- Accepts the current version (an older or unknown version → DS_CONFLICT, so the app shows the latest text).
create or replace function public.accept_terms(p_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text := (select value ->> 'version' from public.platform_config where key = 'legal');
begin
  if auth.uid() is null then
    perform private.raise_ds('DS_AUTH_REQUIRED');
  end if;
  if v_current is null or p_version is distinct from v_current then
    perform private.raise_ds('DS_CONFLICT', jsonb_build_object('reason', 'not_current', 'currentVersion', v_current));
  end if;
  update public.profiles set terms_version = v_current, terms_accepted_at = now()
   where id = auth.uid() and terms_version is distinct from v_current;
  if found then
    perform private.write_audit('shop_user', 'profile.terms_accepted', null, 'profile', auth.uid()::text, null,
      jsonb_build_object('version', v_current));
  end if;
  return public.get_my_consent();
end;
$$;

revoke execute on function public.get_my_consent(), public.accept_terms(text) from public, anon;
grant execute on function public.get_my_consent(), public.accept_terms(text) to authenticated;
grant execute on function public.get_client_config(text, text) to anon, authenticated;
