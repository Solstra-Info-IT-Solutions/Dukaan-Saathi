import {
  type CreateShopInput,
  CreateShopOutputSchema,
  MyContextSchema,
  RegisterDeviceOutputSchema,
  ShopEntitlementsSchema,
  ShopFlagsSchema,
  ShopSettingsSchema,
  type ShopSettingsPatch,
} from '@ds/contracts';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';

/**
 * One RPC per method; responses validated with the shared Zod contracts.
 * Errors are thrown as-is (PostgrestError) for the repository to translate.
 */
export class SupabaseShopDataSource {
  constructor(private readonly client: TypedSupabaseClient) {}

  private async rpc<T>(
    promise: PromiseLike<{ data: unknown; error: unknown }>,
    parse: (d: unknown) => T,
  ): Promise<T> {
    const { data, error } = await promise;
    if (error) throw error;
    return parse(data);
  }

  getMyContext() {
    return this.rpc(this.client.rpc('get_my_context'), (d) => MyContextSchema.parse(d));
  }

  createShop(input: CreateShopInput) {
    return this.rpc(this.client.rpc('create_shop', { p_input: input }), (d) =>
      CreateShopOutputSchema.parse(d),
    );
  }

  acceptInvitation(invitationId: string) {
    return this.rpc(this.client.rpc('accept_shop_invitation', { p_invitation_id: invitationId }), (d) =>
      CreateShopOutputSchema.pick({ shopId: true }).parse(d),
    );
  }

  getSettings(shopId: string) {
    return this.rpc(this.client.rpc('get_shop_settings', { p_shop_id: shopId }), (d) =>
      ShopSettingsSchema.parse(d),
    );
  }

  updateSettings(shopId: string, patch: ShopSettingsPatch) {
    return this.rpc(this.client.rpc('update_shop_settings', { p_shop_id: shopId, p_patch: patch }), (d) =>
      ShopSettingsSchema.parse(d),
    );
  }

  async updateMyLanguage(language: 'en' | 'hi'): Promise<void> {
    const { error } = await this.client.rpc('update_my_profile', {
      p_patch: { preferredLanguage: language },
    });
    if (error) throw error;
  }

  getEntitlements(shopId: string) {
    return this.rpc(this.client.rpc('get_shop_entitlements', { p_shop_id: shopId }), (d) =>
      ShopEntitlementsSchema.parse(d),
    );
  }

  getFlags(shopId: string, appVersion: string) {
    return this.rpc(
      this.client.rpc('get_shop_flags', { p_shop_id: shopId, p_app_version: appVersion }),
      (d) => ShopFlagsSchema.parse(d),
    );
  }

  registerDevice(args: {
    shopId: string;
    installationId: string;
    platform: 'android' | 'ios';
    appVersion: string;
  }) {
    return this.rpc(
      this.client.rpc('register_device', {
        p_shop_id: args.shopId,
        p_installation_id: args.installationId,
        p_platform: args.platform,
        p_app_version: args.appVersion,
      }),
      (d) => RegisterDeviceOutputSchema.parse(d),
    );
  }
}
