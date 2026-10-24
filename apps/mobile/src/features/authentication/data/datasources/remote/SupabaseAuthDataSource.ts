import type { Session } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';
import type { OtpDestination } from '../../../domain/entities/AuthSession';

/** Thin wrapper over supabase.auth. Throws Supabase errors as-is; the repository translates them. */
export class SupabaseAuthDataSource {
  constructor(private readonly client: TypedSupabaseClient) {}

  async requestOtp(destination: OtpDestination): Promise<void> {
    const { error } =
      destination.kind === 'phone'
        ? await this.client.auth.signInWithOtp({ phone: destination.phoneE164 })
        : await this.client.auth.signInWithOtp({
            email: destination.email,
            options: { shouldCreateUser: true },
          });
    if (error) throw error;
  }

  async verifyOtp(destination: OtpDestination, token: string): Promise<Session> {
    const { data, error } =
      destination.kind === 'phone'
        ? await this.client.auth.verifyOtp({ phone: destination.phoneE164, token, type: 'sms' })
        : await this.client.auth.verifyOtp({ email: destination.email, token, type: 'email' });
    if (error) throw error;
    if (!data.session) throw new Error('verifyOtp returned no session');
    return data.session;
  }

  async getSession(): Promise<Session | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  onAuthStateChange(listener: (session: Session | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => listener(session));
    return () => data.subscription.unsubscribe();
  }

  async signOut(): Promise<void> {
    // scope 'local' clears this device even if the network call fails.
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw error;
  }
}
