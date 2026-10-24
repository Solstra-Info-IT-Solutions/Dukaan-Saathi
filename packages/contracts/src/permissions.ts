/**
 * Shop roles and permissions (AUTHORIZATION_MATRIX.md §1).
 * The database seeds `role_permissions` from the same table; a pgTAP test (Phase 02) compares the two.
 * Settings-dependent limits (discount %, void window, cashier visibility) are applied on top by the RPCs.
 */

export const SHOP_ROLES = ['owner', 'manager', 'cashier'] as const;
export type ShopRole = (typeof SHOP_ROLES)[number];

export const PERMISSIONS = [
  'sale.create',
  'sale.discount',
  'sale.price_override',
  'sale.view_all',
  'sale.void',
  'sale.return',
  'sale.review',
  'product.view',
  'product.manage',
  'product.view_cost',
  'stock.view',
  'stock.adjust',
  'purchase.view',
  'purchase.manage',
  'purchase.receive',
  'purchase.pay',
  'customer.view',
  'customer.manage',
  'customer.quick_create',
  'udhaar.grant',
  'udhaar.collect',
  'udhaar.adjust',
  'expense.create',
  'expense.view',
  'day.close',
  'report.view_sales',
  'report.view_profit',
  'report.export',
  'staff.manage',
  'settings.manage',
  'subscription.view',
  'onboarding.request',
  'support.create',
  'audit.view_shop',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MANAGER: readonly Permission[] = [
  'sale.create',
  'sale.discount',
  'sale.price_override',
  'sale.view_all',
  'sale.void',
  'sale.return',
  'sale.review',
  'product.view',
  'product.manage',
  'product.view_cost',
  'stock.view',
  'stock.adjust',
  'purchase.view',
  'purchase.manage',
  'purchase.receive',
  'purchase.pay',
  'customer.view',
  'customer.manage',
  'customer.quick_create',
  'udhaar.grant',
  'udhaar.collect',
  'expense.create',
  'expense.view',
  'day.close',
  'report.view_sales',
  'report.export',
  'subscription.view',
  'onboarding.request',
  'support.create',
];

const CASHIER: readonly Permission[] = [
  'sale.create',
  'sale.discount',
  'product.view',
  'stock.view',
  'customer.view',
  'customer.quick_create',
  'udhaar.grant',
  'udhaar.collect',
  'day.close',
  'support.create',
];

export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<ShopRole, readonly Permission[]>> = {
  owner: PERMISSIONS,
  manager: MANAGER,
  cashier: CASHIER,
};

export function roleHasPermission(role: ShopRole, permission: Permission): boolean {
  return DEFAULT_ROLE_PERMISSIONS[role].includes(permission);
}

export const PLATFORM_ROLES = [
  'super_admin',
  'billing_admin',
  'onboarding_operator',
  'support_agent',
  'analyst',
] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
