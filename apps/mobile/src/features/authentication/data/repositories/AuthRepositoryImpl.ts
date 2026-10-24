import type { Session } from '@supabase/supabase-js';
import { translateError } from '@/core/errors/translateError';
import type { AuthSession, OtpDestination } from '../../domain/entities/AuthSession';
import type { AuthRepository } from '../../domain/repositories/AuthRepository';
import type { SupabaseAuthDataSource } from '../datasources/remote/SupabaseAuthDataSource';

export function toAuthSession(session: Session): AuthSession {
  const user = session.user;
  return {
    userId: user.id,
    phone: user.phone ? `+${user.phone.replace(/^\+/, '')}` : null,
    email: user.email || null, // Supabase uses "" for phone-only users
  };
}

export class AuthRepositoryImpl implements AuthRepository {
  constructor(private readonly remote: SupabaseAuthDataSource) {}

  async requestOtp(destination: OtpDestination): Promise<void> {
    try {
      await this.remote.requestOtp(destination);
    } catch (e) {
      throw translateError(e);
    }
  }

  async verifyOtp(destination: OtpDestination, code: string): Promise<AuthSession> {
    try {
      return toAuthSession(await this.remote.verifyOtp(destination, code));
    } catch (e) {
      throw translateError(e);
    }
  }

  async getSession(): Promise<AuthSession | null> {
    try {
      const session = await this.remote.getSession();
      return session ? toAuthSession(session) : null;
    } catch (e) {
      throw translateError(e);
    }
  }

  onSessionChange(listener: (session: AuthSession | null) => void): () => void {
    return this.remote.onAuthStateChange((session) => listener(session ? toAuthSession(session) : null));
  }

  async signOut(): Promise<void> {
    try {
      await this.remote.signOut();
    } catch (e) {
      throw translateError(e);
    }
  }
}
