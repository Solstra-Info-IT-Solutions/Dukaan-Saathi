import { describe, expect, it, vi } from 'vitest';

vi.mock('@/core/supabase/server', () => ({ createAdminServerClient: vi.fn() }));
vi.mock('@/core/auth/requireOperator', () => ({ requireOperator: vi.fn() }));

const { withParam } = await import('../action');
const { errorText } = await import('../rpc');

describe('withParam', () => {
  it('adds or replaces a query parameter', () => {
    expect(withParam('/shops/1', 'done', '1')).toBe('/shops/1?done=1');
    expect(withParam('/shops?q=ram&error=X', 'error', 'DS_CONFLICT')).toBe('/shops?q=ram&error=DS_CONFLICT');
  });
});

describe('errorText', () => {
  it('shows plain words for known codes and a fallback for others', () => {
    expect(errorText('DS_MFA_REQUIRED')).toMatch(/Two-step/);
    expect(errorText('DS_SOMETHING_NEW')).toBe('Something went wrong. Try again.');
    expect(errorText(undefined)).toBeNull();
  });
});
