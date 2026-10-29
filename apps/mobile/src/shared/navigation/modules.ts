import type { EntitlementKey, EntitlementValue, FeatureFlagKey, Permission } from '@ds/contracts';

/**
 * Modules reachable from the More tab (FEATURE_CONFIGURATION.md §9). Hidden ≠ forbidden: every route
 * also wraps itself in <RequirePermission>, and the server checks again.
 * A module whose entitlement the plan lacks is shown locked (it opens the plan screen); a module whose flag is off is
 * hidden. Plan codes never appear here — only entitlement and flag keys.
 */
export interface ModuleEntry {
  key: string;
  href:
    | '/settings'
    | '/staff'
    | '/diagnostics'
    | '/reports'
    | '/expenses'
    | '/day-close'
    | '/stock'
    | '/suppliers'
    | '/udhaar'
    | '/sync'
    | '/help'
    | '/plan'
    | '/legal';
  labelKey: string;
  icon: string;
  permission?: Permission;
  entitlement?: EntitlementKey;
  flag?: FeatureFlagKey;
}

export const MORE_MODULES: readonly ModuleEntry[] = [
  // Everyone sees today's numbers (cashiers only their own); reports inside need report.view_sales.
  { key: 'reports', href: '/reports', labelKey: 'more.reports', icon: 'chart-bar' },
  {
    key: 'udhaar',
    href: '/udhaar',
    labelKey: 'more.udhaar',
    icon: 'notebook-outline',
    permission: 'customer.view',
  },
  { key: 'stock', href: '/stock', labelKey: 'more.stock', icon: 'warehouse', permission: 'stock.view' },
  {
    key: 'suppliers',
    href: '/suppliers',
    labelKey: 'more.suppliers',
    icon: 'truck-outline',
    permission: 'purchase.view',
    entitlement: 'purchases.enabled',
  },
  {
    key: 'expenses',
    href: '/expenses',
    labelKey: 'more.expenses',
    icon: 'cash-minus',
    permission: 'expense.view',
  },
  {
    key: 'dayClose',
    href: '/day-close',
    labelKey: 'more.dayClose',
    icon: 'cash-register',
    permission: 'day.close',
  },
  {
    key: 'settings',
    href: '/settings',
    labelKey: 'more.settings',
    icon: 'cog-outline',
    permission: 'settings.manage',
  },
  {
    key: 'staff',
    href: '/staff',
    labelKey: 'more.staff',
    icon: 'account-group-outline',
    permission: 'staff.manage',
  },
  // Plan, limits and how to upgrade (Phase 12).
  {
    key: 'plan',
    href: '/plan',
    labelKey: 'more.plan',
    icon: 'star-circle-outline',
    permission: 'subscription.view',
  },
  // Questions to our team (Phase 11).
  { key: 'help', href: '/help', labelKey: 'more.help', icon: 'lifebuoy', permission: 'support.create' },
  // Everyone: what is waiting on this phone (Phase 09).
  { key: 'sync', href: '/sync', labelKey: 'more.sync', icon: 'cloud-sync-outline' },
  { key: 'legal', href: '/legal', labelKey: 'legal.menu', icon: 'shield-check-outline' },
  { key: 'diagnostics', href: '/diagnostics', labelKey: 'diagnostics.title', icon: 'information-outline' },
];

export function visibleModules(
  permissions: readonly Permission[],
  modules: readonly ModuleEntry[] = MORE_MODULES,
) {
  return modules.filter((m) => !m.permission || permissions.includes(m.permission));
}

/** What the shop's plan and flags allow, as last fetched (null while unknown: nothing is locked or hidden). */
export interface ShopAccess {
  entitlements: Record<string, EntitlementValue>;
  flags: Record<string, boolean>;
}

/** A boolean entitlement is on, or a limit is above zero / unlimited. Unknown keys count as off. */
export function hasEntitlement(access: ShopAccess, key: EntitlementKey): boolean {
  const v = access.entitlements[key];
  return v === true || v === null || (typeof v === 'number' && v > 0);
}

/** Unknown flags count as off (FEATURE_CONFIGURATION.md §5). */
export const flagOn = (access: ShopAccess, key: FeatureFlagKey) => access.flags[key] === true;

export type ModuleState = ModuleEntry & { locked: boolean };

/** `canUseModule` for the More list: permission hides, flag off hides, missing entitlement locks. */
export function moduleStates(
  permissions: readonly Permission[],
  access: ShopAccess | null,
  modules: readonly ModuleEntry[] = MORE_MODULES,
): ModuleState[] {
  return visibleModules(permissions, modules)
    .filter((m) => !access || !m.flag || flagOn(access, m.flag))
    .map((m) => ({ ...m, locked: !!access && !!m.entitlement && !hasEntitlement(access, m.entitlement) }));
}
