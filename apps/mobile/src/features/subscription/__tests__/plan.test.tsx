import { DEFAULT_ROLE_PERMISSIONS, type ShopEntitlementsDto } from '@ds/contracts';
import { fireEvent, screen } from '@testing-library/react-native';
import { sessionActions } from '@/core/session/sessionStore';
import { MoreScreen } from '@/features/account/presentation/screens/MoreScreen';
import { moduleStates } from '@/shared/navigation/modules';
import { SHOP_A } from '../../../../tests/fakes/shops';
import { renderWithProviders } from '../../../../tests/renderWithProviders';
import { summarizePlan, whatsappLink } from '../domain/plan';
import { PlanScreen } from '../presentation/screens/PlanScreen';

const NOW = Date.parse('2026-10-28T06:30:00.000Z');

const plan = (over: Partial<ShopEntitlementsDto> = {}): ShopEntitlementsDto => ({
  shopId: SHOP_A,
  planCode: 'free_trial',
  planName: { en: 'Free trial', hi: 'मुफ़्त ट्रायल' },
  subscriptionStatus: 'trialing',
  trialEndsAt: '2026-11-02T06:30:00.000Z',
  currentPeriodEndsAt: '2026-11-02T06:30:00.000Z',
  revision: 'r1',
  entitlements: {
    'products.max': 100,
    'customers.max': null,
    'staff_accounts.max': 1,
    'devices.max': 2,
    'reports.advanced': false,
    'reports.export': true,
    'purchases.enabled': false,
    'voice.billing': true,
    'onboarding.managed': false,
  },
  usage: { 'products.max': 100, 'customers.max': 37, 'staff_accounts.max': 0, 'devices.max': 1 },
  ...over,
});

describe('summarizePlan', () => {
  it('counts trial days and usage against limits', () => {
    const s = summarizePlan(plan(), NOW);
    expect(s.daysLeft).toBe(5);
    expect(s.needsAttention).toBe(false);
    expect(s.usage.find((u) => u.key === 'products.max')).toMatchObject({
      used: 100,
      limit: 100,
      atLimit: true,
    });
    expect(s.usage.find((u) => u.key === 'customers.max')).toMatchObject({
      limit: null,
      fraction: 0,
      atLimit: false,
    });
    expect(s.features.filter((f) => f.included).map((f) => f.key)).toEqual([
      'reports.export',
      'voice.billing',
    ]);
  });
  it('flags past due, grace and expired shops (which still bill)', () => {
    expect(summarizePlan(plan({ subscriptionStatus: 'past_due' }), NOW).needsAttention).toBe(true);
    expect(summarizePlan(plan({ subscriptionStatus: 'expired' }), NOW)).toMatchObject({
      needsAttention: true,
      daysLeft: null,
    });
  });
  it('builds a WhatsApp link only for a real number', () => {
    expect(whatsappLink('+919812345678', 'Upgrade — Sharma')).toBe(
      'https://wa.me/919812345678?text=Upgrade%20%E2%80%94%20Sharma',
    );
    expect(whatsappLink(null, 'x')).toBeNull();
    expect(whatsappLink('98123', 'x')).toBeNull();
  });
});

describe('moduleStates', () => {
  const owner = DEFAULT_ROLE_PERMISSIONS.owner;
  it('locks a module the plan does not include and shows everything while access is unknown', () => {
    const locked = moduleStates(owner, { entitlements: { 'purchases.enabled': false }, flags: {} });
    expect(locked.find((m) => m.key === 'suppliers')?.locked).toBe(true);
    expect(locked.find((m) => m.key === 'stock')?.locked).toBe(false);
    expect(moduleStates(owner, null).every((m) => !m.locked)).toBe(true);
  });
  it('hides a module whose flag is off', () => {
    const modules = [
      { key: 'x', href: '/sync' as const, labelKey: 'more.sync', icon: 'a', flag: 'offline_sync' as const },
    ];
    expect(moduleStates(owner, { entitlements: {}, flags: { offline_sync: false } }, modules)).toEqual([]);
    expect(moduleStates(owner, { entitlements: {}, flags: { offline_sync: true } }, modules)).toHaveLength(1);
  });
});

describe('screens', () => {
  it('shows the plan, usage and what is included, and contacts sales on WhatsApp', async () => {
    const openUrl = jest.fn(async () => {});
    await renderWithProviders(
      <PlanScreen
        deps={{
          getEntitlements: { execute: async () => plan() },
          getClientConfig: async () => ({
            revision: 'c1',
            minSupportedAppVersion: '0.0.0',
            refreshSeconds: 900,
            flags: {},
            announcements: [],
            content: {},
            supportContact: { whatsapp: '+919812345678', phone: null },
          }),
          openUrl,
          now: () => NOW,
        }}
        shopId={SHOP_A}
        shopName="Sharma Kirana"
      />,
    );
    expect(await screen.findByText('Free trial · 5 days left')).toBeTruthy();
    expect(screen.getByText('100 of 100')).toBeTruthy();
    expect(screen.getByText('37 · no limit')).toBeTruthy();
    expect(screen.getAllByText('Not included')).toHaveLength(3);
    await fireEvent.press(await screen.findByText('Message us on WhatsApp'));
    expect(openUrl).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/919812345678?text='));
  });

  it('opens the plan screen from a locked module in More', async () => {
    sessionActions.setActiveShop({
      shopId: SHOP_A,
      shopName: 'Sharma Kirana',
      role: 'owner',
      permissions: DEFAULT_ROLE_PERMISSIONS.owner,
      deviceId: 'device-a',
      deviceCode: 'A',
      invoicePrefix: 'DS',
      fy: '2627',
      lastSeq: 0,
    });
    const onOpen = jest.fn();
    await renderWithProviders(
      <MoreScreen
        deps={{
          signOut: { execute: async () => {} },
          getAccess: async () => ({ entitlements: { 'purchases.enabled': false }, flags: {} }),
        }}
        onOpen={onOpen}
        onSwitchShop={jest.fn()}
      />,
    );
    await fireEvent.press(await screen.findByText('Not in your plan · see Plan'));
    expect(onOpen).toHaveBeenCalledWith('/plan');
    sessionActions.setActiveShop(null);
  });
});
