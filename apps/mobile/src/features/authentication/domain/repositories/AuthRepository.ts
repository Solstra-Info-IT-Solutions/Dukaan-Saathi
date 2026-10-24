import type { AuthSession, OtpDestination } from '../entities/AuthSession';

export interface AuthRepository {
  requestOtp(destination: OtpDestination): Promise<void>;
  verifyOtp(destination: OtpDestination, code: string): Promise<AuthSession>;
  getSession(): Promise<AuthSession | null>;
  /** Calls back on sign-in, sign-out and token refresh. Returns an unsubscribe function. */
  onSessionChange(listener: (session: AuthSession | null) => void): () => void;
  signOut(): Promise<void>;
}
