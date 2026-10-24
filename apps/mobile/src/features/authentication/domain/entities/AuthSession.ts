/** The signed-in user as far as the app needs to know. Tokens stay inside the data layer. */
export interface AuthSession {
  userId: string;
  phone: string | null;
  email: string | null;
}

/** Where a one-time code is sent. Phone OTP is the default; email OTP works without an SMS provider. */
export type OtpDestination = { kind: 'phone'; phoneE164: string } | { kind: 'email'; email: string };

export type OtpChannel = OtpDestination['kind'];
