import { act, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Text } from 'react-native';
import { initialSessionState, sessionActions, useSessionStore } from '@/core/session/sessionStore';
import type { AuthRepository, AuthSession } from '@/features/authentication';
import { ActivateShop, LoadMyContext, RestoreSession } from '@/features/shops';
import { RequirePermission } from '@/shared/components/RequirePermission';
import { visibleModules } from '@/shared/navigation/modules';
import { DEFAULT_ROLE_PERMISSIONS } from '@ds/contracts';
import { FakeDeviceRepository, FakeShopRepository, memoryLastShop, SHOP_A } from '../../../tests/fakes/shops';
import { createTestQueryClient, renderWithProviders } from '../../../tests/renderWithProviders';
import type { AppFeatures } from '../container';
import { SessionController } from '../SessionController';

function fakeAuth(initial: AuthSession | null) {
  let listener: ((s: AuthSession | null) => void) | null = null;
  const repo: AuthRepository = {
    requestOtp: async () => {},
    verifyOtp: async () => initial!,
    getSession: async () => initial,
    onSessionChange: (l) => {
      listener = l;
      return () => {
        listener = null;
      };
    },
    signOut: async () => {},
  };
  return { repo, emit: (s: AuthSession | null) => listener?.(s) };
}

function features(authRepo: AuthRepository, shops: FakeShopRepository): AppFeatures {
  const last = memoryLastShop();
  const loadContext = new LoadMyContext(shops);
  const activateShop = new ActivateShop(new FakeDeviceRepository(), last);
  return {
    auth: { repository: authRepo },
    shops: { restoreSession: new RestoreSession(loadContext, activateShop, last) },
  } as unknown as AppFeatures;
}

beforeEach(() => useSessionStore.setState(initialSessionState));

describe('SessionController', () => {
  it('restores the only shop for a saved session', async () => {
    const auth = fakeAuth({ userId: 'u1', phone: '+919000000001', email: null });
    await render(
      <QueryClientProvider client={createTestQueryClient()}>
        <SessionController features={features(auth.repo, new FakeShopRepository())}>
          <Text>child</Text>
        </SessionController>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(useSessionStore.getState().authStatus).toBe('signedIn'));
    expect(useSessionStore.getState().activeShop).toMatchObject({ shopId: SHOP_A, deviceCode: 'A' });
  });

  it('signs out when the auth session ends', async () => {
    const auth = fakeAuth({ userId: 'u1', phone: null, email: 'a@b.in' });
    await render(
      <QueryClientProvider client={createTestQueryClient()}>
        <SessionController features={features(auth.repo, new FakeShopRepository())}>
          <Text>child</Text>
        </SessionController>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(useSessionStore.getState().authStatus).toBe('signedIn'));
    await act(async () => auth.emit(null));
    expect(useSessionStore.getState()).toMatchObject({ authStatus: 'signedOut', activeShop: null });
  });

  it('is signed out without a backend', async () => {
    await render(
      <QueryClientProvider client={createTestQueryClient()}>
        <SessionController features={null}>
          <Text>child</Text>
        </SessionController>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(useSessionStore.getState().authStatus).toBe('signedOut'));
  });
});

describe('navigation gating', () => {
  it('lists only modules the role may open', () => {
    expect(visibleModules(DEFAULT_ROLE_PERMISSIONS.owner).map((m) => m.key)).toEqual([
      'reports',
      'expenses',
      'dayClose',
      'settings',
      'staff',
      'diagnostics',
    ]);
    // Cashiers: today's own sales and closing their drawer, but not expenses, settings or staff.
    expect(visibleModules(DEFAULT_ROLE_PERMISSIONS.cashier).map((m) => m.key)).toEqual([
      'reports',
      'dayClose',
      'diagnostics',
    ]);
  });

  it('RequirePermission blocks a deep link for a cashier', async () => {
    sessionActions.signedIn('u1', {
      shopId: SHOP_A,
      shopName: 'Sharma Kirana',
      role: 'cashier',
      permissions: DEFAULT_ROLE_PERMISSIONS.cashier,
      deviceId: 'd',
      deviceCode: 'A',
      invoicePrefix: 'DS',
      fy: '2627',
      lastSeq: 0,
    });
    await renderWithProviders(
      <RequirePermission permission="settings.manage">
        <Text>secret settings</Text>
      </RequirePermission>,
    );
    expect(screen.queryByText('secret settings')).toBeNull();
    expect(screen.getByText("You don't have permission to do this.")).toBeOnTheScreen();
  });
});
