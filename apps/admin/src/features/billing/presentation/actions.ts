'use server';

import { adminAction, field } from '@/core/admin/action';
import { AdminRpcError } from '@/core/admin/rpc';
import { BillingRepository } from '../data/BillingRepository';
import {
  type EntitlementValueType,
  istInputToIso,
  parseEntitlementInput,
  rupeesToPaise,
} from '../domain/entitlements';

const BILLING = ['super_admin', 'billing_admin'] as const;
const shopPath = (form: FormData) => `/shops/${field(form, 'shopId')}`;

/** The value's type comes from `valueType`, or from `type:<key>` when the form lets the operator choose the key. */
function entitlementValue(form: FormData) {
  const type = (field(form, 'valueType') ||
    field(form, `type:${field(form, 'key')}`)) as EntitlementValueType;
  const parsed = parseEntitlementInput(type, field(form, 'value'));
  if (!parsed.ok) throw new AdminRpcError('DS_VALIDATION_FAILED');
  return parsed.value;
}

function expiresAt(form: FormData) {
  const iso = istInputToIso(field(form, 'expiresAt'));
  if (iso === undefined) throw new AdminRpcError('DS_VALIDATION_FAILED');
  return iso;
}

/** Create (no id) or edit a plan's name, price, period, trial, visibility and status. */
export async function savePlanAction(form: FormData) {
  return adminAction(BILLING, '/plans', async (client) => {
    const price = rupeesToPaise(field(form, 'price') || '0');
    const trialDays = Number(field(form, 'trialDays') || '0');
    if (!price.ok || !Number.isInteger(trialDays) || !field(form, 'nameEn')) {
      throw new AdminRpcError('DS_VALIDATION_FAILED');
    }
    const id = field(form, 'id');
    await new BillingRepository(client).savePlan({
      ...(id ? { id } : { code: field(form, 'code') }),
      name: { en: field(form, 'nameEn'), ...(field(form, 'nameHi') ? { hi: field(form, 'nameHi') } : {}) },
      pricePaise: price.value,
      billingPeriod: field(form, 'billingPeriod') as 'month' | 'year' | 'none',
      trialDays,
      isPublic: form.get('isPublic') === 'on',
      status: field(form, 'status') as 'draft' | 'active' | 'retired',
    });
  });
}

/** One cell of the plan × entitlement table. Takes effect on the server immediately. */
export async function setPlanEntitlementAction(form: FormData) {
  return adminAction(BILLING, '/plans', async (client) => {
    await new BillingRepository(client).setPlanEntitlement(
      field(form, 'planId'),
      field(form, 'key'),
      entitlementValue(form),
    );
  });
}

export async function assignPlanAction(form: FormData) {
  return adminAction(BILLING, shopPath(form), async (client) => {
    const status = field(form, 'status') === 'trialing' ? 'trialing' : 'active';
    const end = istInputToIso(field(form, 'endsAt'));
    if (end === undefined) throw new AdminRpcError('DS_VALIDATION_FAILED');
    await new BillingRepository(client).assignPlan(
      field(form, 'shopId'),
      {
        planCode: field(form, 'planCode'),
        status,
        ...(end ? (status === 'trialing' ? { trialEndsAt: end } : { periodEnd: end }) : {}),
      },
      field(form, 'reason'),
    );
  });
}

export async function setOverrideAction(form: FormData) {
  return adminAction(BILLING, shopPath(form), async (client) => {
    await new BillingRepository(client).setOverride(
      field(form, 'shopId'),
      field(form, 'key'),
      entitlementValue(form),
      field(form, 'reason'),
      expiresAt(form),
    );
  });
}

export async function endOverrideAction(form: FormData) {
  return adminAction(BILLING, shopPath(form), async (client) => {
    await new BillingRepository(client).endOverride(field(form, 'overrideId'), field(form, 'reason'));
  });
}

/** Flag on / off / back to the rollout for one shop (super_admin). */
export async function setFlagOverrideAction(form: FormData) {
  return adminAction(['super_admin'], shopPath(form), async (client) => {
    const v = field(form, 'value');
    await new BillingRepository(client).setFlagOverride(
      field(form, 'shopId'),
      field(form, 'key'),
      v === 'on' ? true : v === 'off' ? false : null,
      field(form, 'reason'),
      expiresAt(form),
    );
  });
}
