import type { EntitlementKey, EntitlementValue, ShopEntitlementsDto } from '@ds/contracts';

/** Limits shown as usage bars, and features shown as included / not included on the plan screen. */
export const USAGE_KEYS = ['products.max', 'customers.max', 'staff_accounts.max', 'devices.max'] as const;
export const FEATURE_KEYS = [
  'reports.advanced',
  'reports.export',
  'purchases.enabled',
  'voice.billing',
  'onboarding.managed',
] as const satisfies readonly EntitlementKey[];

export interface UsageLine {
  key: (typeof USAGE_KEYS)[number];
  used: number;
  /** null = unlimited */
  limit: number | null;
  /** 0..1 for the bar; 0 when unlimited */
  fraction: number;
  atLimit: boolean;
}

export interface PlanSummary {
  planCode: string;
  planName: { en: string; hi?: string } | null;
  status: ShopEntitlementsDto['subscriptionStatus'];
  /** Whole days left of the trial, or of the paid period while past due / in grace. */
  daysLeft: number | null;
  endsAt: string | null;
  /** Past due, grace or expired: the shop still bills, but should renew. */
  needsAttention: boolean;
  usage: UsageLine[];
  features: { key: (typeof FEATURE_KEYS)[number]; included: boolean }[];
}

const DAY = 86_400_000;
const asLimit = (v: EntitlementValue | undefined): number | null => (typeof v === 'number' ? v : null);

export function summarizePlan(e: ShopEntitlementsDto, now: number): PlanSummary {
  const endsAt = e.subscriptionStatus === 'trialing' ? e.trialEndsAt : e.currentPeriodEndsAt;
  const daysLeft =
    endsAt && ['trialing', 'active', 'past_due', 'grace'].includes(e.subscriptionStatus)
      ? Math.max(0, Math.ceil((Date.parse(endsAt) - now) / DAY))
      : null;
  return {
    planCode: e.planCode,
    planName: e.planName ?? null,
    status: e.subscriptionStatus,
    daysLeft,
    endsAt: endsAt ?? null,
    needsAttention: ['past_due', 'grace', 'expired'].includes(e.subscriptionStatus),
    usage: USAGE_KEYS.map((key) => {
      const limit = e.entitlements[key] === null ? null : asLimit(e.entitlements[key]);
      const used = e.usage[key] ?? 0;
      return {
        key,
        used,
        limit,
        fraction: limit === null ? 0 : limit === 0 ? 1 : Math.min(1, used / limit),
        atLimit: limit !== null && used >= limit,
      };
    }),
    features: FEATURE_KEYS.map((key) => ({ key, included: e.entitlements[key] === true })),
  };
}

/** wa.me link with a short message; null when no WhatsApp number is configured. */
export function whatsappLink(phoneE164: string | null | undefined, message: string): string | null {
  if (!phoneE164 || !/^\+\d{10,15}$/.test(phoneE164)) return null;
  return `https://wa.me/${phoneE164.slice(1)}?text=${encodeURIComponent(message)}`;
}
