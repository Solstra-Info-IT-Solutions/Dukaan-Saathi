import { MyContextSchema } from '@ds/contracts';
import { translateError } from '@/core/errors/translateError';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';
import type { MyProfile, ProfilePatch, ProfileRepository } from '../domain/profile';

/** Reads the profile from get_my_context and saves it with update_my_profile (both existing RPCs). */
export class SupabaseProfileRepository implements ProfileRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async get(): Promise<MyProfile | null> {
    const { data, error } = await this.client.rpc('get_my_context');
    if (error) throw translateError(error);
    return MyContextSchema.parse(data).profile;
  }

  async update(patch: ProfilePatch): Promise<void> {
    const { error } = await this.client.rpc('update_my_profile', { p_patch: { ...patch } });
    if (error) throw translateError(error);
  }
}
