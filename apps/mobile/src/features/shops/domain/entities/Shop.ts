import type {
  CreateShopInput,
  InvitationDto,
  MembershipDto,
  MyContextDto,
  ShopEntitlementsDto,
  ShopFlagsDto,
  ShopSettingsDto,
  ShopSettingsPatch,
} from '@ds/contracts';

/*
 * The RPC contracts already have the exact shape the domain needs, so the entities are the contract
 * types (validated by Zod in the data layer). Separate classes would add mapping code without value.
 */
export type Membership = MembershipDto;
export type Invitation = InvitationDto;
export type MyContext = MyContextDto;
export type ShopSettings = ShopSettingsDto;
export type { ShopSettingsPatch };
export type ShopEntitlements = ShopEntitlementsDto;
export type ShopFlags = ShopFlagsDto;
export type NewShop = Omit<CreateShopInput, 'clientOperationId'>;

/** What the app needs after a shop is opened on this device (mirrors core/session ActiveShop). */
export interface ShopActivation {
  shopId: string;
  shopName: string;
  role: Membership['role'];
  permissions: readonly Membership['permissions'][number][];
  deviceId: string;
  deviceCode: string;
  invoicePrefix: string;
  fy: string;
  lastSeq: number;
}

export interface DeviceRegistration {
  deviceId: string;
  deviceCode: string;
  invoicePrefix: string;
  fy: string;
  lastSeq: number;
}
