/**
 * Entitlement and feature-flag keys (FEATURE_CONFIGURATION.md §3, §5).
 * Seeded into entitlement_definitions / feature_flags. Code must refer to these constants,
 * never to plan codes.
 */

export const ENTITLEMENTS = {
  'products.max': { type: 'limit', safeDefault: 100 },
  'staff_accounts.max': { type: 'limit', safeDefault: 1 },
  'devices.max': { type: 'limit', safeDefault: 1 },
  'customers.max': { type: 'limit', safeDefault: 200 },
  'reports.advanced': { type: 'boolean', safeDefault: false },
  'reports.export': { type: 'boolean', safeDefault: false },
  'exports.monthly': { type: 'limit', safeDefault: 0 },
  'catalogue.import': { type: 'boolean', safeDefault: true },
  'import.rows_per_job': { type: 'limit', safeDefault: 500 },
  'purchases.enabled': { type: 'boolean', safeDefault: false },
  'offline.enabled': { type: 'boolean', safeDefault: true },
  'voice.billing': { type: 'boolean', safeDefault: false },
  'onboarding.managed': { type: 'boolean', safeDefault: false },
} as const satisfies Record<
  string,
  { type: 'boolean'; safeDefault: boolean } | { type: 'limit'; safeDefault: number }
>;

export type EntitlementKey = keyof typeof ENTITLEMENTS;
export const ENTITLEMENT_KEYS = Object.keys(ENTITLEMENTS) as EntitlementKey[];

/** Resolved entitlement value: boolean, a limit, or null meaning unlimited. */
export type EntitlementValue = boolean | number | null;

export const FEATURE_FLAGS = [
  'voice_billing',
  'offline_sync',
  'thermal_printing',
  'barcode_continuous_scan',
  'whatsapp_receipt_share',
  'udhaar_reminders',
  'import_xlsx',
] as const;
export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number];

export function safeDefaultEntitlements(): Record<EntitlementKey, EntitlementValue> {
  const result = {} as Record<EntitlementKey, EntitlementValue>;
  for (const key of ENTITLEMENT_KEYS) result[key] = ENTITLEMENTS[key].safeDefault;
  return result;
}
