import type { Permission } from '@ds/contracts';

/**
 * Modules reachable from the More tab (FEATURE_CONFIGURATION.md §9). Hidden ≠ forbidden: every route
 * also wraps itself in <RequirePermission>, and the server checks again.
 * Entitlement and flag gates are added here in Phase 12.
 */
export interface ModuleEntry {
  key: string;
  href: '/settings' | '/staff' | '/diagnostics' | '/reports' | '/expenses' | '/day-close';
  labelKey: string;
  icon: string;
  permission?: Permission;
}

export const MORE_MODULES: readonly ModuleEntry[] = [
  // Everyone sees today's numbers (cashiers only their own); reports inside need report.view_sales.
  { key: 'reports', href: '/reports', labelKey: 'more.reports', icon: 'chart-bar' },
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
  { key: 'diagnostics', href: '/diagnostics', labelKey: 'diagnostics.title', icon: 'information-outline' },
];

export function visibleModules(
  permissions: readonly Permission[],
  modules: readonly ModuleEntry[] = MORE_MODULES,
) {
  return modules.filter((m) => !m.permission || permissions.includes(m.permission));
}
