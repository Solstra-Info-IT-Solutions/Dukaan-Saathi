import { describe, expect, it } from 'vitest';
import {
  compareSemver,
  DEFAULT_CLIENT_CONFIG,
  DEFAULT_ROLE_PERMISSIONS,
  isServerErrorCode,
  normalizeIndianPhone,
  parseClientConfig,
  PERMISSIONS,
  roleHasPermission,
  safeDefaultEntitlements,
} from '../index';

describe('error codes', () => {
  it('recognises server codes only', () => {
    expect(isServerErrorCode('DS_PERMISSION_DENIED')).toBe(true);
    expect(isServerErrorCode('NETWORK_OFFLINE')).toBe(false);
    expect(isServerErrorCode('permission denied for table sales')).toBe(false);
  });
});

describe('role permissions (AUTHORIZATION_MATRIX.md)', () => {
  it('owner has every permission', () => {
    expect([...DEFAULT_ROLE_PERMISSIONS.owner].sort()).toEqual([...PERMISSIONS].sort());
  });
  it.each([
    ['cashier', 'sale.void', false],
    ['cashier', 'report.view_sales', false],
    ['cashier', 'udhaar.collect', true],
    ['manager', 'udhaar.adjust', false],
    ['manager', 'staff.manage', false],
    ['manager', 'settings.manage', false],
    ['manager', 'report.view_profit', false],
    ['owner', 'udhaar.adjust', true],
  ] as const)('%s / %s → %s', (role, permission, expected) => {
    expect(roleHasPermission(role, permission)).toBe(expected);
  });
  it('manager and cashier permissions are subsets of the catalogue', () => {
    const all = new Set<string>(PERMISSIONS);
    for (const p of [...DEFAULT_ROLE_PERMISSIONS.manager, ...DEFAULT_ROLE_PERMISSIONS.cashier]) {
      expect(all.has(p)).toBe(true);
    }
  });
});

describe('phone normalisation', () => {
  it.each([
    ['98765 43210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['+91-9876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeIndianPhone(input)).toBe(expected);
  });
  it.each(['12345', '5876543210', '+1 415 555 0100'])('rejects %s', (input) => {
    expect(normalizeIndianPhone(input)).toBeNull();
  });
});

describe('client config', () => {
  it('accepts a valid payload and ignores unknown keys', () => {
    const { config, valid } = parseClientConfig({
      revision: 'r7',
      minSupportedAppVersion: '1.2.0',
      flags: { voice_billing: true },
      someFutureKey: 42,
    });
    expect(valid).toBe(true);
    expect(config.flags.voice_billing).toBe(true);
    expect(config.refreshSeconds).toBe(900);
  });
  it('falls back to the last good config when invalid', () => {
    const { config, valid } = parseClientConfig({ revision: 3 });
    expect(valid).toBe(false);
    expect(config).toBe(DEFAULT_CLIENT_CONFIG);
  });
  it('compares versions numerically', () => {
    expect(compareSemver('1.10.0', '1.2.10')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('0.9.9', '1.0.0')).toBeLessThan(0);
  });
});

describe('entitlements', () => {
  it('safe defaults keep billing-adjacent features conservative', () => {
    const defaults = safeDefaultEntitlements();
    expect(defaults['voice.billing']).toBe(false);
    expect(defaults['offline.enabled']).toBe(true);
    expect(defaults['products.max']).toBe(100);
  });
});
