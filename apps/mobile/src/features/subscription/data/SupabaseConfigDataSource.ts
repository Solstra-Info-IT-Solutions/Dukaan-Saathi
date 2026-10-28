import { type ClientConfig, parseClientConfig } from '@ds/contracts';
import { translateError } from '@/core/errors/translateError';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';

/** get_client_config (public app configuration). An invalid payload falls back to the bundled defaults. */
export class SupabaseConfigDataSource {
  constructor(
    private readonly client: TypedSupabaseClient,
    private readonly appVersion: string,
  ) {}

  async getClientConfig(): Promise<ClientConfig> {
    const { data, error } = await this.client.rpc('get_client_config', {
      p_app_version: this.appVersion,
      p_platform: 'android',
    });
    if (error) throw translateError(error);
    return parseClientConfig(data).config;
  }
}
