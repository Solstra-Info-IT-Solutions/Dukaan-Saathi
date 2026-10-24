import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAdminEnv } from '@/core/config/env';
import { decideOperatorAccess, type OperatorIdentity } from '../domain/operatorAccess';
import { LoginForm } from '../presentation/LoginForm';

afterEach(cleanup);

const operator = (overrides: Partial<OperatorIdentity> = {}): OperatorIdentity => ({
  userId: 'u1',
  email: 'op@example.com',
  aal: 'aal2',
  role: 'support_agent',
  ...overrides,
});

describe('decideOperatorAccess (deny by default)', () => {
  const allowed = ['support_agent', 'super_admin'] as const;

  it.each([
    ['backend missing', { backendConfigured: false, identity: operator() }, 'backend_not_configured'],
    ['signed out', { backendConfigured: true, identity: null }, 'signed_out'],
    ['not an operator', { backendConfigured: true, identity: operator({ role: null }) }, 'not_an_operator'],
    ['non-operator without MFA is still just not an operator', { backendConfigured: true, identity: operator({ role: null, aal: 'aal1' }) }, 'not_an_operator'],
    ['operator without MFA', { backendConfigured: true, identity: operator({ aal: 'aal1' }) }, 'mfa_required'],
    ['wrong role', { backendConfigured: true, identity: operator({ role: 'analyst' }) }, 'role_not_permitted'],
    ['allowed', { backendConfigured: true, identity: operator() }, 'allowed'],
  ] as const)('%s → %s', (_name, input, expected) => {
    expect(decideOperatorAccess({ ...input, allowedRoles: allowed }).kind).toBe(expected);
  });
});

describe('parseAdminEnv', () => {
  it('is unconfigured when empty', () => {
    expect(parseAdminEnv({})).toEqual({ backend: null, issues: [] });
  });
  it('accepts a publishable key', () => {
    expect(parseAdminEnv({ url: 'https://x.supabase.co', key: 'sb_publishable_1' }).backend).toEqual({
      url: 'https://x.supabase.co',
      publishableKey: 'sb_publishable_1',
    });
  });
  it('refuses a secret key', () => {
    const env = parseAdminEnv({ url: 'https://x.supabase.co', key: 'sb_secret_1' });
    expect(env.backend).toBeNull();
    expect(env.issues[0]).toMatch(/secret/);
  });
});

describe('LoginForm', () => {
  it('shows the generic credentials error returned by the action', async () => {
    const action = vi.fn(async () => ({ error: 'invalid_credentials' as const }));
    render(<LoginForm action={action} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'op@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Email or password is incorrect.');
    expect(action).toHaveBeenCalledTimes(1);
  });
});
