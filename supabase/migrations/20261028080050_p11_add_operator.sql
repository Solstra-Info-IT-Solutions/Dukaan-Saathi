-- Phase 11: adding an operator. The admin-invite-operator Edge Function creates the auth user (invite email, needs
-- the service role) and then calls this RPC as the signed-in super admin, so the role check (with MFA) and the audit
-- happen here, exactly like every other admin change.
create or replace function public.admin_add_operator(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.platform_admins;
begin
  perform private.require_platform_role(array['super_admin']);
  if p_role is null or p_role not in ('super_admin', 'billing_admin', 'onboarding_operator', 'support_agent', 'analyst') then
    perform private.raise_ds('DS_VALIDATION_FAILED', '{"field":"role"}');
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    perform private.raise_ds('DS_NOT_FOUND');
  end if;
  select * into v_before from public.platform_admins where user_id = p_user_id;
  insert into public.platform_admins (user_id, role, status, created_by)
  values (p_user_id, p_role, 'active', auth.uid())
  on conflict (user_id) do update set role = excluded.role, status = 'active', updated_at = now();
  perform private.write_audit('platform_admin', 'admin.operator_invited', null, 'platform_admin', p_user_id::text,
    case when v_before.user_id is null then null
         else jsonb_build_object('role', v_before.role, 'status', v_before.status) end,
    jsonb_build_object('role', p_role, 'status', 'active'));
  return jsonb_build_object('userId', p_user_id, 'role', p_role, 'status', 'active');
end;
$$;

revoke execute on function public.admin_add_operator(uuid, text) from public, anon;
grant execute on function public.admin_add_operator(uuid, text) to authenticated;
