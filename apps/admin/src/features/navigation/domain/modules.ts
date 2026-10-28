import type { PlatformRole } from '@ds/contracts';

/** Admin modules by role (ADMIN_PANEL_SPECIFICATION.md §2). The database re-checks every call. */
export interface AdminModule {
  href: string;
  label: string;
  roles: readonly PlatformRole[];
}

const ALL: readonly PlatformRole[] = [
  'super_admin',
  'billing_admin',
  'onboarding_operator',
  'support_agent',
  'analyst',
];

export const ADMIN_MODULES: readonly AdminModule[] = [
  { href: '/', label: 'Dashboard', roles: ALL },
  { href: '/shops', label: 'Shops', roles: ALL },
  { href: '/onboarding', label: 'Onboarding', roles: ['super_admin', 'onboarding_operator'] },
  { href: '/support', label: 'Support', roles: ['super_admin', 'support_agent'] },
  { href: '/announcements', label: 'Announcements', roles: ['super_admin', 'support_agent'] },
  { href: '/audit', label: 'Audit log', roles: ['super_admin'] },
  { href: '/operators', label: 'Operators', roles: ['super_admin'] },
];

export const modulesFor = (role: PlatformRole) => ADMIN_MODULES.filter((m) => m.roles.includes(role));

export const rolesFor = (href: string): readonly PlatformRole[] =>
  ADMIN_MODULES.find((m) => m.href === href)?.roles ?? ['super_admin'];
