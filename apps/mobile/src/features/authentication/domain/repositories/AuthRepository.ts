import type { AuthSession, OtpDestination, SignUpResult } from '../entities/AuthSession';

export interface AuthRepository {
  requestOtp(destination: OtpDestination): Promise<void>;
  verifyOtp(destination: OtpDestination, code: string): Promise<AuthSession>;
  getSession(): Promise<AuthSession | null>;
  /** Calls back on sign-in, sign-out and token refresh. Returns an unsubscribe function. */
  onSessionChange(listener: (session: AuthSession | null) => void): () => void;
  signOut(): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<AuthSession>;
  signUp(input: { email: string; password: string; displayName: string }): Promise<SignUpResult>;
  /** Emails a reset code (Supabase "Reset password" template with {{ .Token }}). */
  requestPasswordReset(email: string): Promise<void>;
  /** Checks the emailed code, which signs the user in, then sets the new password. */
  resetPassword(email: string, code: string, newPassword: string): Promise<AuthSession>;
  /** Sets a new password for the signed-in user. */
  updatePassword(newPassword: string): Promise<void>;
}
