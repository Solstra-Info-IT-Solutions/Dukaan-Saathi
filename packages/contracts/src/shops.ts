import { z } from 'zod';
import { BasisPointsSchema, IndianPhoneE164Schema, UuidSchema } from './common';
import { PERMISSIONS, SHOP_ROLES } from './permissions';

/**
 * Phase 02 RPC contracts (API_AND_RPC_CONTRACTS.md §4, features/authentication-and-shops.md).
 * Response schemas parse what PostgreSQL returns; unknown extra keys are stripped, not errors,
 * so additive server changes never break installed apps.
 */

export const BUSINESS_CATEGORIES = [
  'kirana',
  'general',
  'medical',
  'hardware',
  'stationery',
  'cosmetics',
  'other',
] as const;
export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

export const ShopRoleSchema = z.enum(SHOP_ROLES);
// Unknown permissions from a newer server are dropped rather than failing the whole context.
const PermissionListSchema = z
  .array(z.string())
  .transform((list) =>
    list.filter((p): p is (typeof PERMISSIONS)[number] => (PERMISSIONS as readonly string[]).includes(p)),
  );

export const MembershipSchema = z.object({
  shopId: UuidSchema,
  shopName: z.string(),
  shopStatus: z.enum(['active', 'suspended', 'closed']),
  role: ShopRoleSchema,
  permissions: PermissionListSchema,
});
export type MembershipDto = z.infer<typeof MembershipSchema>;

export const InvitationSchema = z.object({
  invitationId: UuidSchema,
  shopId: UuidSchema,
  shopName: z.string(),
  role: z.enum(['manager', 'cashier']),
  expiresAt: z.string(),
});
export type InvitationDto = z.infer<typeof InvitationSchema>;

export const MyContextSchema = z.object({
  userId: UuidSchema,
  profile: z
    .object({
      displayName: z.string().nullable(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
      preferredLanguage: z.enum(['en', 'hi']),
    })
    .nullable(),
  memberships: z.array(MembershipSchema),
  invitations: z.array(InvitationSchema),
});
export type MyContextDto = z.infer<typeof MyContextSchema>;

export const CreateShopInputSchema = z.object({
  clientOperationId: UuidSchema,
  name: z.string().trim().min(2).max(80),
  businessCategory: z.enum(BUSINESS_CATEGORIES),
  phone: IndianPhoneE164Schema.optional(),
  city: z.string().trim().max(80).optional(),
});
export type CreateShopInput = z.infer<typeof CreateShopInputSchema>;

export const CreateShopOutputSchema = z.object({ shopId: UuidSchema, replayed: z.boolean().optional() });

export const PAYMENT_METHODS = ['cash', 'upi', 'card', 'other', 'udhaar'] as const;
export const TAX_MODES = ['none', 'gst_regular', 'gst_composition'] as const;
export const UPI_VPA_RE = /^[A-Za-z0-9._-]{2,255}@[A-Za-z]{2,64}$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const ShopSettingsSchema = z.object({
  shopId: UuidSchema,
  name: z.string(),
  businessCategory: z.enum(BUSINESS_CATEGORIES),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  timezone: z.string(),
  invoicePrefix: z.string(),
  taxMode: z.enum(TAX_MODES),
  gstin: z.string().nullable(),
  roundOffEnabled: z.boolean(),
  enabledPaymentMethods: z.array(z.enum(PAYMENT_METHODS)),
  upiVpa: z.string().nullable(),
  negativeStockPolicy: z.enum(['allow', 'warn', 'block']),
  creditLimitPolicy: z.enum(['none', 'warn', 'block']),
  voidWindowMinutes: z.number().int(),
  cashierDiscountLimitBp: z.number().int(),
  managerDiscountLimitBp: z.number().int(),
  priceOverrideAllowed: z.boolean(),
  cashierSeesAllSales: z.boolean(),
});
export type ShopSettingsDto = z.infer<typeof ShopSettingsSchema>;

/** Client-side mirror of the CHECK constraints in shop_settings, so errors show before the round trip. */
export const ShopSettingsPatchSchema = z
  .object({
    invoicePrefix: z.string().regex(/^[A-Z0-9]{1,6}$/, 'INVALID_PREFIX'),
    taxMode: z.enum(TAX_MODES),
    gstin: z.string().regex(GSTIN_RE, 'INVALID_GSTIN').nullable(),
    roundOffEnabled: z.boolean(),
    enabledPaymentMethods: z.array(z.enum(PAYMENT_METHODS)).min(1, 'AT_LEAST_ONE'),
    upiVpa: z.string().regex(UPI_VPA_RE, 'INVALID_VPA').nullable(),
    voidWindowMinutes: z.number().int().min(0).max(43_200),
    cashierDiscountLimitBp: BasisPointsSchema,
    managerDiscountLimitBp: BasisPointsSchema,
    priceOverrideAllowed: z.boolean(),
    cashierSeesAllSales: z.boolean(),
  })
  .partial()
  .refine(
    (p) => p.taxMode === undefined || p.taxMode === 'none' || (p.gstin !== undefined && p.gstin !== null),
    {
      message: 'GSTIN_REQUIRED',
      path: ['gstin'],
    },
  );
export type ShopSettingsPatch = z.infer<typeof ShopSettingsPatchSchema>;

export const RegisterDeviceOutputSchema = z.object({
  deviceId: UuidSchema,
  deviceCode: z.string().regex(/^[A-Z]{1,3}$/),
  invoicePrefix: z.string(),
  fy: z.string().regex(/^\d{4}$/),
  lastSeq: z.number().int().min(0),
});
export type RegisterDeviceOutput = z.infer<typeof RegisterDeviceOutputSchema>;

export const ShopMemberSchema = z.object({
  userId: UuidSchema,
  displayName: z.string().nullable(),
  role: ShopRoleSchema,
  status: z.enum(['active', 'deactivated']),
  joinedAt: z.string(),
  isMe: z.boolean(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});
export type ShopMemberDto = z.infer<typeof ShopMemberSchema>;

const EntitlementValueSchema = z.union([z.boolean(), z.number(), z.null()]);
export const ShopEntitlementsSchema = z.object({
  shopId: UuidSchema,
  planCode: z.string(),
  subscriptionStatus: z.enum(['trialing', 'active', 'past_due', 'grace', 'expired', 'cancelled']),
  trialEndsAt: z.string().nullable(),
  currentPeriodEndsAt: z.string().nullable(),
  revision: z.string(),
  entitlements: z.record(z.string(), EntitlementValueSchema),
  usage: z.record(z.string(), z.number()),
});
export type ShopEntitlementsDto = z.infer<typeof ShopEntitlementsSchema>;
