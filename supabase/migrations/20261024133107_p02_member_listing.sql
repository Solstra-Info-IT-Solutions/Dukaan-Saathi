-- Member list for the Staff screen. profiles is readable only by its owner (RLS), so names of
-- colleagues come through this RPC. Contacts (phone/email) and deactivated members are returned
-- only to callers with staff.manage.
create or replace function public.list_shop_members(p_shop_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_can_manage boolean;
begin
  v_role := private.require_member(p_shop_id);
  v_can_manage := exists (select 1 from public.role_permissions rp where rp.role = v_role and rp.permission = 'staff.manage');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'userId', m.user_id,
             'displayName', p.display_name,
             'role', m.role,
             'status', m.status,
             'joinedAt', m.joined_at,
             'isMe', m.user_id = auth.uid(),
             'phone', case when v_can_manage or m.user_id = auth.uid() then p.phone_e164 end,
             'email', case when v_can_manage or m.user_id = auth.uid() then p.email end)
           order by case m.role when 'owner' then 0 when 'manager' then 1 else 2 end, m.joined_at)
      from public.shop_members m
      left join public.profiles p on p.id = m.user_id
     where m.shop_id = p_shop_id
       and (m.status = 'active' or v_can_manage)), '[]'::jsonb);
end;
$$;

revoke execute on function public.list_shop_members(uuid) from public, anon;
grant execute on function public.list_shop_members(uuid) to authenticated;
