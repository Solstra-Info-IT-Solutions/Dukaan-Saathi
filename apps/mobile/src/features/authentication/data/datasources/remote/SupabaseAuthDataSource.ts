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

  async signInWithPassword(email: string, password: string): Promise<Session> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  }

  /** Session is null when the project asks new users to confirm their email first. */
  async signUp(email: string, password: string, displayName: string): Promise<Session | null> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) throw error;
    // An existing, confirmed email comes back as a user without identities (Supabase hides that it exists).
    if (data.user && data.user.identities?.length === 0) throw { code: 'user_already_exists' };
    return data.session;
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email);
    if (error) throw error;
  }

  async verifyRecovery(email: string, token: string): Promise<Session> {
    const { data, error } = await this.client.auth.verifyOtp({ email, token, type: 'recovery' });
    if (error) throw error;
    if (!data.session) throw new Error('verifyOtp returned no session');
    return data.session;
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    // scope 'local' clears this device even if the network call fails.
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw error;
  }
}
