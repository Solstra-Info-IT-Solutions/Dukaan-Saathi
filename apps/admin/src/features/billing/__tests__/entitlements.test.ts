import { describe, expect, it } from 'vitest';
import { flagFromForm, flagSummary } from '@/features/flags/domain/flags';
import {
  formatEntitlement,
  istInputToIso,
  parseEntitlementInput,
  parseJson,
  rupeesToPaise,
} from '../domain/entitlements';

describe('entitlement values', () => {
  it('reads yes/no for features', () => {
    expect(parseEntitlementInput('boolean', 'Yes')).toEqual({ ok: true, value: true });
    expect(parseEntitlementInput('boolean', 'false')).toEqual({ ok: true, value: false });
    expect(parseEntitlementInput('boolean', '5')).toEqual({ ok: false });
  });
  it('reads whole numbers or unlimited for limits', () => {
    expect(parseEntitlementInput('limit', ' 500 ')).toEqual({ ok: true, value: 500 });
    expect(parseEntitlementInput('limit', 'unlimited')).toEqual({ ok: true, value: null });
    expect(parseEntitlementInput('limit', '')).toEqual({ ok: true, value: null });
    expect(parseEntitlementInput('limit', '-1')).toEqual({ ok: false });
    expect(parseEntitlementInput('limit', '2.5')).toEqual({ ok: false });
  });
  it('formats them for the table', () => {
    expect([true, false, null, 20, undefined].map(formatEntitlement)).toEqual([
      'Yes',
      'No',
      'Unlimited',
      '20',
      '—',
    ]);
  });
});

describe('form parsing', () => {
  it('turns rupees into paise', () => {
    expect(rupeesToPaise('₹ 1,299.5')).toEqual({ ok: true, value: 129950 });
    expect(rupeesToPaise('499')).toEqual({ ok: true, value: 49900 });
    expect(rupeesToPaise('12.345')).toEqual({ ok: false });
  });
  it('parses JSON for the config editor', () => {
    expect(parseJson('{"a": 1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJson('{a: 1}')).toEqual({ ok: false });
  });
  it('reads India time from date inputs', () => {
    expect(istInputToIso('2026-11-30T23:59')).toBe('2026-11-30T18:29:00.000Z');
    expect(istInputToIso('')).toBeNull();
    expect(istInputToIso('nonsense')).toBeUndefined();
  });
});

describe('flags', () => {
  const form = (v: Record<string, string>, on: string[] = []) =>
    flagFromForm(
      (n) => v[n] ?? '',
      (n) => on.includes(n),
    );
  it('validates rollout and minimum version', () => {
    expect(form({ rolloutPercent: '20', minAppVersion: '1.2.0', description: 'x' }, ['enabled'])).toEqual({
      ok: true,
      value: { enabled: true, rolloutPercent: 20, minAppVersion: '1.2.0', description: 'x' },
    });
    expect(form({ rolloutPercent: '120' }).ok).toBe(false);
    expect(form({ rolloutPercent: '50', minAppVersion: 'v2' }).ok).toBe(false);
  });
  it('describes who gets a flag', () => {
    expect(flagSummary({ enabled: false, rolloutPercent: 100, minAppVersion: null })).toBe(
      'Off for everyone',
    );
    expect(flagSummary({ enabled: true, rolloutPercent: 100, minAppVersion: null })).toBe('All shops');
    expect(flagSummary({ enabled: true, rolloutPercent: 20, minAppVersion: '1.3.0' })).toBe(
      '20% of shops on app 1.3.0 or newer',
    );
  });
});
