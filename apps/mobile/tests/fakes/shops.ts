import type { CreateShopInput, ShopRole } from '@ds/contracts';
import { DEFAULT_ROLE_PERMISSIONS } from '@ds/contracts';
import type {
  DeviceRegistration,
  Membership,
  MyContext,
  ShopEntitlements,
  ShopSettings,
  ShopSettingsPatch,
} from '@/features/shops/domain/entities/Shop';
import type {
  DeviceRepository,
  LastShopPreference,
  ShopRepository,
} from '@/features/shops/domain/repositories/ShopRepository';

export const SHOP_A = '0190f0f0-0000-7000-8000-00000000000a';
export const SHOP_B = '0190f0f0-0000-7000-8000-00000000000b';
export const USER = '0190f0f0-0000-7000-8000-0000000000f1';

export function membership(shopId: string, shopName: string, role: ShopRole = 'owner'): Membership {
  return { shopId, shopName, shopStatus: 'active', role, permissions: [...DEFAULT_ROLE_PERMISSIONS[role]] };
}

export function context(memberships: Membership[], invitations: MyContext['invitations'] = []): MyContext {
  return {
    userId: USER,
    profile: { displayName: null, phone: '+919000000001', email: null, preferredLanguage: 'hi' },
    memberships,
    invitations,
  };
}

export const baseSettings: ShopSettings = {
  shopId: SHOP_A,
  name: 'Sharma Kirana',
  businessCategory: 'kirana',
  phone: null,
  city: null,
  timezone: 'Asia/Kolkata',
  invoicePrefix: 'DS',
  taxMode: 'none',
  gstin: null,
  roundOffEnabled: false,
  enabledPaymentMethods: ['cash', 'upi', 'udhaar'],
  upiVpa: null,
  negativeStockPolicy: 'warn',
  creditLimitPolicy: 'warn',
  voidWindowMinutes: 1440,
  cashierDiscountLimitBp: 0,
  managerDiscountLimitBp: 1000,
  priceOverrideAllowed: false,
  cashierSeesAllSales: false,
};

export class FakeShopRepository implements ShopRepository {
  ctx: MyContext = context([membership(SHOP_A, 'Sharma Kirana')]);
  settings: ShopSettings = { ...baseSettings };
  created: CreateShopInput[] = [];
  accepted: string[] = [];
  updates: ShopSettingsPatch[] = [];
  createError: unknown = null;
  entitlements: ShopEntitlements = {
    shopId: SHOP_A,
    planCode: 'free_trial',
    subscriptionStatus: 'trialing',
    trialEndsAt: '2026-11-23T00:00:00.000Z',
    currentPeriodEndsAt: null,
    revision: 'r1',
    entitlements: { 'staff_accounts.max': 3 },
    usage: { 'staff_accounts.max': 0 },
  };

  async getMyContext() {
    return this.ctx;
  }
  async createShop(input: CreateShopInput) {
    this.created.push(input);
    if (this.createError) throw this.createError;
    const shopId = SHOP_B;
    this.ctx = { ...this.ctx, memberships: [...this.ctx.memberships, membership(shopId, input.name)] };
    return { shopId };
  }
  async acceptInvitation(invitationId: string) {
    this.accepted.push(invitationId);
    const inv = this.ctx.invitations.find((i) => i.invitationId === invitationId);
    if (!inv) throw new Error('not found');
    this.ctx = {
      ...this.ctx,
      invitations: this.ctx.invitations.filter((i) => i !== inv),
      memberships: [...this.ctx.memberships, membership(inv.shopId, inv.shopName, inv.role)],
    };
    return { shopId: inv.shopId };
  }
  async getSettings() {
    return this.settings;
  }
  async updateSettings(_shopId: string, patch: ShopSettingsPatch) {
    this.updates.push(patch);
    this.settings = { ...this.settings, ...patch } as ShopSettings;
    return this.settings;
  }
  async updateMyLanguage() {}
  async getEntitlements() {
    return this.entitlements;
  }
}

export class FakeDeviceRepository implements DeviceRepository {
  calls: string[] = [];
  async registerDevice(shopId: string): Promise<DeviceRegistration> {
    this.calls.push(shopId);
    return { deviceId: `device-${shopId}`, deviceCode: 'A', invoicePrefix: 'DS', fy: '2627', lastSeq: 0 };
  }
}

export function memoryLastShop(initial: string | null = null): LastShopPreference & { value: string | null } {
  return {
    value: initial,
    async get() {
      return this.value;
    },
    async set(id: string) {
      this.value = id;
    },
    async clear() {
      this.value = null;
    },
  };
}
