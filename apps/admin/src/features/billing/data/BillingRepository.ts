import 'server-only';
import { rpc } from '@/core/admin/rpc';
import type { AdminSupabaseClient } from '@/core/supabase/server';
import type { EntitlementValue, EntitlementValueType } from '../domain/entitlements';

export interface EntitlementDefinition {
  key: string;
  valueType: EntitlementValueType;
  defaultValue: EntitlementValue;
  description: string;
}

export interface Plan {
  id: string;
  code: string;
  name: { en: string; hi?: string };
  pricePaise: number;
  billingPeriod: 'month' | 'year' | 'none';
  trialDays: number;
  isPublic: boolean;
  status: 'draft' | 'active' | 'retired';
  revision: number;
  shopCount: number;
  entitlements: Record<string, EntitlementValue>;
}

export interface ShopAccess {
  effectivePlanCode: string;
  entitlements: Record<string, EntitlementValue>;
  subscriptions: {
    id: string;
    planCode: string;
    status: string;
    isCurrent: boolean;
    provider: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    createdAt: string;
  }[];
  overrides: {
    id: string;
    key: string;
    value: EntitlementValue;
    reason: string;
    expiresAt: string | null;
    active: boolean;
    createdAt: string;
    createdBy: string | null;
  }[];
  flags: {
    key: string;
    enabled: boolean;
    override: { value: boolean; reason: string; expiresAt: string | null } | null;
  }[];
}

/** Plans, entitlements, a shop's subscription and overrides (super_admin, billing_admin; analysts read). */
export class BillingRepository {
  constructor(private readonly client: AdminSupabaseClient) {}

  listPlans() {
    return rpc<{ definitions: EntitlementDefinition[]; plans: Plan[] }>(this.client, 'admin_list_plans', {});
  }

  savePlan(input: Partial<Omit<Plan, 'entitlements' | 'revision' | 'shopCount'>>) {
    return rpc<{ id: string }>(this.client, 'admin_save_plan', { p_input: input });
  }

  setPlanEntitlement(planId: string, key: string, value: EntitlementValue) {
    return rpc(this.client, 'admin_set_plan_entitlement', { p_plan_id: planId, p_key: key, p_value: value });
  }

  shopAccess(shopId: string) {
    return rpc<ShopAccess>(this.client, 'admin_get_shop_access', { p_shop_id: shopId });
  }

  assignPlan(
    shopId: string,
    input: { planCode: string; status: 'trialing' | 'active'; periodEnd?: string; trialEndsAt?: string },
    reason: string,
  ) {
    return rpc(this.client, 'admin_assign_plan', { p_shop_id: shopId, p_input: input, p_reason: reason });
  }

  setOverride(
    shopId: string,
    key: string,
    value: EntitlementValue,
    reason: string,
    expiresAt: string | null,
  ) {
    return rpc(this.client, 'admin_set_entitlement_override', {
      p_shop_id: shopId,
      p_key: key,
      p_value: value,
      p_reason: reason,
      p_expires_at: expiresAt,
    });
  }

  endOverride(overrideId: string, reason: string) {
    return rpc(this.client, 'admin_end_entitlement_override', {
      p_override_id: overrideId,
      p_reason: reason,
    });
  }

  setFlagOverride(
    shopId: string,
    key: string,
    value: boolean | null,
    reason: string,
    expiresAt: string | null,
  ) {
    return rpc(this.client, 'admin_set_flag_override', {
      p_shop_id: shopId,
      p_key: key,
      p_value: value,
      p_reason: reason,
      p_expires_at: expiresAt,
    });
  }
}
