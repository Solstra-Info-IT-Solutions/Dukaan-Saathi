import { describe, expect, it } from 'vitest';
import { modulesFor, rolesFor } from '../domain/modules';

const hrefs = (role: Parameters<typeof modulesFor>[0]) => modulesFor(role).map((m) => m.href);

describe('admin modules by role', () => {
  it('gives super_admin everything', () => {
    expect(hrefs('super_admin')).toEqual([
      '/',
      '/shops',
      '/onboarding',
      '/support',
      '/announcements',
      '/audit',
      '/operators',
    ]);
  });
  it('limits each other role to its own work', () => {
    expect(hrefs('onboarding_operator')).toEqual(['/', '/shops', '/onboarding']);
    expect(hrefs('support_agent')).toEqual(['/', '/shops', '/support', '/announcements']);
    expect(hrefs('billing_admin')).toEqual(['/', '/shops']);
    expect(hrefs('analyst')).toEqual(['/', '/shops']);
  });
  it('denies unknown pages to everyone but super_admin', () => {
    expect(rolesFor('/nope')).toEqual(['super_admin']);
  });
});
