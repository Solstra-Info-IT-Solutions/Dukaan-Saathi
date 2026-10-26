import type { CreateShopInput } from '@ds/contracts';
import type {
  DeviceRegistration,
  MyContext,
  ShopEntitlements,
  ShopSettings,
  ShopSettingsPatch,
} from '../entities/Shop';

export interface ShopRepository {
  getMyContext(): Promise<MyContext>;
  createShop(input: CreateShopInput): Promise<{ shopId: string }>;
  acceptInvitation(invitationId: string): Promise<{ shopId: string }>;
  getSettings(shopId: string): Promise<ShopSettings>;
  updateSettings(shopId: string, patch: ShopSettingsPatch): Promise<ShopSettings>;
  updateMyLanguage(language: 'en' | 'hi'): Promise<void>;
  getEntitlements(shopId: string): Promise<ShopEntitlements>;
}

export interface DeviceRepository {
  /** Registers this installation with the shop (idempotent per installation). */
  registerDevice(shopId: string): Promise<DeviceRegistration>;
}

/** Remembers which shop was open last so the app reopens it. */
/** The last session restored online, kept so the shop opens without a connection (Phase 09). */
export interface SessionSnapshotStore {
  load(): Promise<string | null>;
  save(json: string): Promise<void>;
  clear(): Promise<void>;
}

export interface LastShopPreference {
  get(): Promise<string | null>;
  set(shopId: string): Promise<void>;
  clear(): Promise<void>;
}
