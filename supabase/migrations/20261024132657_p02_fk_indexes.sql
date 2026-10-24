-- Covering indexes for foreign keys flagged by the Supabase performance advisor.
create index if not exists plan_entitlements_key on public.plan_entitlements (entitlement_key);
create index if not exists platform_admins_created_by on public.platform_admins (created_by);
create index if not exists platform_config_updated_by on public.platform_config (updated_by);
create index if not exists shop_devices_registered_by on public.shop_devices (registered_by);
create index if not exists shop_entitlement_overrides_created_by on public.shop_entitlement_overrides (created_by);
create index if not exists shop_entitlement_overrides_key on public.shop_entitlement_overrides (entitlement_key);
create index if not exists shop_invitations_accepted_by on public.shop_invitations (accepted_by);
create index if not exists shop_invitations_invited_by on public.shop_invitations (invited_by);
create index if not exists shop_members_invited_by on public.shop_members (invited_by);
create index if not exists shop_settings_updated_by on public.shop_settings (updated_by);
create index if not exists shop_subscriptions_plan on public.shop_subscriptions (plan_id);
