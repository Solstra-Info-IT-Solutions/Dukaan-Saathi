import type { CreateShopInput } from '@ds/contracts';
import { translateError } from '@/core/errors/translateError';
import type { InstallationIdStore } from '@/core/security/installation';
import type { DeviceRegistration, ShopSettingsPatch } from '../../domain/entities/Shop';
import type { DeviceRepository, ShopRepository } from '../../domain/repositories/ShopRepository';
import type { SupabaseShopDataSource } from '../datasources/remote/SupabaseShopDataSource';

async function translated<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw translateError(e);
  }
}

export class ShopRepositoryImpl implements ShopRepository {
  constructor(private readonly remote: SupabaseShopDataSource) {}

  getMyContext = () => translated(() => this.remote.getMyContext());
  createShop = (input: CreateShopInput) => translated(() => this.remote.createShop(input));
  acceptInvitation = (invitationId: string) => translated(() => this.remote.acceptInvitation(invitationId));
  getSettings = (shopId: string) => translated(() => this.remote.getSettings(shopId));
  updateSettings = (shopId: string, patch: ShopSettingsPatch) =>
    translated(() => this.remote.updateSettings(shopId, patch));
  updateMyLanguage = (language: 'en' | 'hi') => translated(() => this.remote.updateMyLanguage(language));
  getEntitlements = (shopId: string) => translated(() => this.remote.getEntitlements(shopId));
}

export class DeviceRepositoryImpl implements DeviceRepository {
  constructor(
    private readonly remote: SupabaseShopDataSource,
    private readonly installation: InstallationIdStore,
    private readonly platform: 'android' | 'ios',
    private readonly appVersion: string,
  ) {}

  registerDevice(shopId: string): Promise<DeviceRegistration> {
    return translated(async () =>
      this.remote.registerDevice({
        shopId,
        installationId: await this.installation.get(),
        platform: this.platform,
        appVersion: this.appVersion,
      }),
    );
  }
}
