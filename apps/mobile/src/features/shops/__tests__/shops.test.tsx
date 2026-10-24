import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AppError } from '@/core/errors/AppError';
import {
  baseSettings,
  context,
  FakeDeviceRepository,
  FakeShopRepository,
  membership,
  memoryLastShop,
  SHOP_A,
  SHOP_B,
} from '../../../../tests/fakes/shops';
import { renderHookWithQuery, renderWithProviders } from '../../../../tests/renderWithProviders';
import { ShopInputError } from '../domain/errors';
import {
  AcceptInvitation,
  ActivateShop,
  CreateShop,
  GetShopSettings,
  LoadMyContext,
  pickInitialShop,
  RestoreSession,
  trialDaysLeft,
  UpdateShopSettings,
} from '../domain/usecases/shopUseCases';
import { SelectShopScreen } from '../presentation/screens/SelectShopScreen';
import { ShopSettingsScreen } from '../presentation/screens/ShopSettingsScreen';
import { useCreateShopViewModel } from '../presentation/viewmodels/useCreateShopViewModel';
import { diffPatch, toDraft } from '../presentation/viewmodels/useShopSettingsViewModel';

const invitation = {
  invitationId: '0190f0f0-0000-7000-8000-0000000000c1',
  shopId: SHOP_B,
  shopName: 'Gupta General',
  role: 'cashier' as const,
  expiresAt: '2026-11-01T00:00:00Z',
};

describe('pickInitialShop', () => {
  const a = membership(SHOP_A, 'A');
  const b = membership(SHOP_B, 'B');
  it('reopens the last shop', () => {
    expect(pickInitialShop(context([a, b]), SHOP_B)).toBe(b);
  });
  it('opens the only shop', () => {
    expect(pickInitialShop(context([a]), null)).toBe(a);
  });
  it('asks when there are several shops or pending invitations', () => {
    expect(pickInitialShop(context([a, b]), null)).toBeNull();
    expect(pickInitialShop(context([a], [invitation]), null)).toBeNull();
  });
  it('ignores a suspended last shop', () => {
    expect(pickInitialShop(context([{ ...a, shopStatus: 'suspended' }]), SHOP_A)).toBeNull();
  });
});

describe('ActivateShop / RestoreSession', () => {
  it('registers the device and remembers the shop', async () => {
    const devices = new FakeDeviceRepository();
    const last = memoryLastShop();
    const activation = await new ActivateShop(devices, last).execute(membership(SHOP_A, 'Sharma Kirana'));
    expect(devices.calls).toEqual([SHOP_A]);
    expect(last.value).toBe(SHOP_A);
    expect(activation).toMatchObject({ shopId: SHOP_A, deviceCode: 'A', role: 'owner', fy: '2627' });
  });
  it('restores the last shop after sign-in', async () => {
    const shops = new FakeShopRepository();
    shops.ctx = context([membership(SHOP_A, 'A'), membership(SHOP_B, 'B')]);
    const last = memoryLastShop(SHOP_B);
    const restore = new RestoreSession(
      new LoadMyContext(shops),
      new ActivateShop(new FakeDeviceRepository(), last),
      last,
    );
    expect((await restore.execute()).activation?.shopId).toBe(SHOP_B);
  });
});

describe('CreateShop', () => {
  it('validates before calling the server', async () => {
    const shops = new FakeShopRepository();
    await expect(
      new CreateShop(shops, () => 'id').execute({ name: 'X', businessCategory: 'kirana' }),
    ).rejects.toBeInstanceOf(ShopInputError);
    expect(shops.created).toHaveLength(0);
  });
  it('passes the idempotency key', async () => {
    const shops = new FakeShopRepository();
    const opId = '0190f0f0-0000-7000-8000-0000000000aa';
    await new CreateShop(shops, () => 'unused').execute(
      { name: 'Gupta General', businessCategory: 'general' },
      opId,
    );
    expect(shops.created[0]).toMatchObject({ clientOperationId: opId, name: 'Gupta General' });
  });
});

describe('UpdateShopSettings', () => {
  it('rejects values the database would reject', async () => {
    const shops = new FakeShopRepository();
    await expect(
      new UpdateShopSettings(shops).execute(SHOP_A, { upiVpa: 'not a vpa' }),
    ).rejects.toBeInstanceOf(ShopInputError);
    expect(shops.updates).toHaveLength(0);
  });
});

describe('settings draft', () => {
  it('sends only changed fields in RPC units', () => {
    const draft = {
      ...toDraft(baseSettings),
      invoicePrefix: 'sk',
      cashierDiscountPercent: '5',
      upiVpa: 'sharma@okaxis',
    };
    expect(diffPatch(baseSettings, draft)).toEqual({
      invoicePrefix: 'SK',
      upiVpa: 'sharma@okaxis',
      cashierDiscountLimitBp: 500,
    });
  });
  it('is empty when nothing changed', () => {
    expect(diffPatch(baseSettings, toDraft(baseSettings))).toEqual({});
  });
});

describe('trialDaysLeft', () => {
  it('rounds up and never goes negative', () => {
    const now = Date.parse('2026-10-24T00:00:00Z');
    expect(trialDaysLeft('2026-11-23T00:00:00Z', now)).toBe(30);
    expect(trialDaysLeft('2026-10-24T01:00:00Z', now)).toBe(1);
    expect(trialDaysLeft('2026-10-01T00:00:00Z', now)).toBe(0);
    expect(trialDaysLeft(null, now)).toBeNull();
  });
});

const OP_1 = '0190f0f0-0000-7000-8000-0000000000d1';
const OP_2 = '0190f0f0-0000-7000-8000-0000000000d2';

describe('useCreateShopViewModel', () => {
  function setup(shops: FakeShopRepository) {
    const ids = [OP_1, OP_2, '0190f0f0-0000-7000-8000-0000000000d3'];
    const onActivated = jest.fn();
    const deps = {
      createShop: new CreateShop(shops, () => 'unused'),
      loadContext: new LoadMyContext(shops),
      activateShop: new ActivateShop(new FakeDeviceRepository(), memoryLastShop()),
      newOperationId: () => ids.shift() ?? '0190f0f0-0000-7000-8000-0000000000d9',
    };
    return { deps, onActivated };
  }

  it('reuses the operation id when retrying the same form, and opens the new shop', async () => {
    const shops = new FakeShopRepository();
    shops.createError = new AppError('NETWORK_TIMEOUT');
    const { deps, onActivated } = setup(shops);
    const { result } = await renderHookWithQuery(() => useCreateShopViewModel(deps, onActivated));
    await act(async () => result.current.form.setValue('name', 'Gupta General'));
    await act(async () => result.current.actions.submit());
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    expect(result.current.state.errorKey).toBe('errors.NETWORK_TIMEOUT');

    shops.createError = null;
    await act(async () => result.current.actions.submit());
    await waitFor(() => expect(onActivated).toHaveBeenCalled());
    expect(shops.created.map((c) => c.clientOperationId)).toEqual([OP_1, OP_1]);
    expect(onActivated.mock.calls[0][0]).toMatchObject({ shopId: SHOP_B, shopName: 'Gupta General' });
  });

  it('starts a new operation when the form changed after a failure', async () => {
    const shops = new FakeShopRepository();
    shops.createError = new AppError('NETWORK_TIMEOUT');
    const { deps, onActivated } = setup(shops);
    const { result } = await renderHookWithQuery(() => useCreateShopViewModel(deps, onActivated));
    await act(async () => result.current.form.setValue('name', 'Gupta General'));
    await act(async () => result.current.actions.submit());
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    await act(async () => result.current.form.setValue('name', 'Gupta General Store'));
    await act(async () => result.current.actions.submit());
    await waitFor(() => expect(shops.created).toHaveLength(2));
    expect(shops.created.map((c) => c.clientOperationId)).toEqual([OP_1, OP_2]);
  });
});

describe('SelectShopScreen', () => {
  it('opens a shop', async () => {
    const shops = new FakeShopRepository();
    const onActivated = jest.fn();
    const deps = {
      loadContext: new LoadMyContext(shops),
      activateShop: new ActivateShop(new FakeDeviceRepository(), memoryLastShop()),
      acceptInvitation: new AcceptInvitation(shops),
    };
    await renderWithProviders(
      <SelectShopScreen
        deps={deps}
        onActivated={onActivated}
        onCreateShop={jest.fn()}
        onSignOut={jest.fn()}
      />,
    );
    await fireEvent.press(await screen.findByText('Sharma Kirana'));
    await waitFor(() =>
      expect(onActivated).toHaveBeenCalledWith(expect.objectContaining({ shopId: SHOP_A })),
    );
  });

  it('joins a shop from an invitation and opens it', async () => {
    const shops = new FakeShopRepository();
    shops.ctx = context([], [invitation]);
    const onActivated = jest.fn();
    const deps = {
      loadContext: new LoadMyContext(shops),
      activateShop: new ActivateShop(new FakeDeviceRepository(), memoryLastShop()),
      acceptInvitation: new AcceptInvitation(shops),
    };
    await renderWithProviders(
      <SelectShopScreen
        deps={deps}
        onActivated={onActivated}
        onCreateShop={jest.fn()}
        onSignOut={jest.fn()}
      />,
    );
    await fireEvent.press(await screen.findByText('Join'));
    await waitFor(() =>
      expect(onActivated).toHaveBeenCalledWith(expect.objectContaining({ shopId: SHOP_B, role: 'cashier' })),
    );
    expect(shops.accepted).toEqual([invitation.invitationId]);
  });

  it('welcomes a new user with no shops', async () => {
    const shops = new FakeShopRepository();
    shops.ctx = context([]);
    const deps = {
      loadContext: new LoadMyContext(shops),
      activateShop: new ActivateShop(new FakeDeviceRepository(), memoryLastShop()),
      acceptInvitation: new AcceptInvitation(shops),
    };
    await renderWithProviders(
      <SelectShopScreen deps={deps} onActivated={jest.fn()} onCreateShop={jest.fn()} onSignOut={jest.fn()} />,
    );
    expect(await screen.findByText('Welcome!')).toBeOnTheScreen();
  });
});

describe('ShopSettingsScreen', () => {
  it('saves only the changed field', async () => {
    const shops = new FakeShopRepository();
    const deps = { getSettings: new GetShopSettings(shops), updateSettings: new UpdateShopSettings(shops) };
    await renderWithProviders(<ShopSettingsScreen deps={deps} shopId={SHOP_A} />);
    await fireEvent.changeText(await screen.findByLabelText('UPI ID for QR payments'), 'sharma@okaxis');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(shops.updates).toEqual([{ upiVpa: 'sharma@okaxis' }]));
    expect(await screen.findByText('Saved')).toBeOnTheScreen();
  });

  it('shows a field error without calling the server', async () => {
    const shops = new FakeShopRepository();
    const deps = { getSettings: new GetShopSettings(shops), updateSettings: new UpdateShopSettings(shops) };
    await renderWithProviders(<ShopSettingsScreen deps={deps} shopId={SHOP_A} />);
    await fireEvent.changeText(await screen.findByLabelText('UPI ID for QR payments'), 'bad vpa');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Enter a UPI ID like name@bank.')).toBeOnTheScreen();
    expect(shops.updates).toHaveLength(0);
  });
});
