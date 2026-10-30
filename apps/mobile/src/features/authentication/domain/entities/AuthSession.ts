/** The signed-in user as far as the app needs to know. Tokens stay inside the data layer. */
export interface AuthSession {
  userId: string;
  phone: string | null;
  email: string | null;
}

/** Where a one-time code is sent. Phone OTP is the default; email OTP works without an SMS provider. */
export type OtpDestination = { kind: 'phone'; phoneE164: string } | { kind: 'email'; email: string };

export type OtpChannel = OtpDestination['kind'];

/** Result of creating an account: signed in at once, or the email must be confirmed with a code first. */
export type SignUpResult =
  { kind: 'signed_in'; session: AuthSession } | { kind: 'confirm_email'; email: string };
