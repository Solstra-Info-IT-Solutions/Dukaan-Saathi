import { type ClientConfig, type ConsentDto, ConsentSchema, parseClientConfig } from '@ds/contracts';
import { translateError } from '@/core/errors/translateError';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';

/**
 * get_client_config (public app configuration; an invalid payload falls back to the bundled defaults) and the
 * signed-in user's acceptance of the privacy policy and terms.
 */
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

  async getMyConsent(): Promise<ConsentDto> {
    const { data, error } = await this.client.rpc('get_my_consent');
    if (error) throw translateError(error);
    return ConsentSchema.parse(data);
  }

  async acceptTerms(version: string): Promise<ConsentDto> {
    const { data, error } = await this.client.rpc('accept_terms', { p_version: version });
    if (error) throw translateError(error);
    return ConsentSchema.parse(data);
  }
}
