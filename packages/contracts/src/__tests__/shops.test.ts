import { describe, expect, it } from 'vitest';
import { CreateShopInputSchema, MyContextSchema, ShopSettingsPatchSchema } from '../shops';

const uuid = '0190f0f0-0000-7000-8000-000000000001';

describe('MyContextSchema', () => {
  it('parses get_my_context output and drops unknown permissions', () => {
    const parsed = MyContextSchema.parse({
      userId: uuid,
      profile: { displayName: null, phone: '+919000000001', email: null, preferredLanguage: 'hi' },
      memberships: [
        {
          shopId: uuid,
          shopName: 'Sharma Kirana',
          shopStatus: 'active',
          role: 'owner',
          permissions: ['sale.create', 'future.thing'],
        },
      ],
      invitations: [],
      somethingNew: true,
    });
    expect(parsed.memberships[0]?.permissions).toEqual(['sale.create']);
  });
});

describe('CreateShopInputSchema', () => {
  it('trims and validates the name', () => {
    expect(
      CreateShopInputSchema.parse({
        clientOperationId: uuid,
        name: '  Gupta General ',
        businessCategory: 'general',
      }).name,
    ).toBe('Gupta General');
    expect(
      CreateShopInputSchema.safeParse({ clientOperationId: uuid, name: 'X', businessCategory: 'general' })
        .success,
    ).toBe(false);
  });
});

describe('ShopSettingsPatchSchema', () => {
  it('mirrors database constraints', () => {
    expect(ShopSettingsPatchSchema.safeParse({ invoicePrefix: 'ds!' }).success).toBe(false);
    expect(ShopSettingsPatchSchema.safeParse({ upiVpa: 'sharma@okaxis' }).success).toBe(true);
    expect(ShopSettingsPatchSchema.safeParse({ enabledPaymentMethods: [] }).success).toBe(false);
  });
  it('requires a GSTIN for GST tax modes', () => {
    expect(ShopSettingsPatchSchema.safeParse({ taxMode: 'gst_regular' }).success).toBe(false);
    expect(
      ShopSettingsPatchSchema.safeParse({ taxMode: 'gst_regular', gstin: '08ABCDE1234F1Z5' }).success,
    ).toBe(true);
    expect(ShopSettingsPatchSchema.safeParse({ taxMode: 'none' }).success).toBe(true);
  });
});
