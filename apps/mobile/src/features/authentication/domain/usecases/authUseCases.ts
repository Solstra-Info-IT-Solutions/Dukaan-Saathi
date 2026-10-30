import { normalizeIndianPhone } from '@ds/contracts';
import type { AuthSession, OtpChannel, OtpDestination, SignUpResult } from '../entities/AuthSession';
import { AuthInputError } from '../errors';
import type { AuthRepository } from '../repositories/AuthRepository';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CODE_RE = /^\d{6,8}$/;
/** Our minimum (Supabase's own default is 6). Supabase hashes at most 72 bytes. */
export const MIN_PASSWORD_LENGTH = 8;

export function toEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new AuthInputError('invalid_email');
  return email;
}

function checkNewPassword(password: string, confirm: string) {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 72) {
    throw new AuthInputError('invalid_password');
  }
  if (password !== confirm) throw new AuthInputError('passwords_differ');
}

/** Turns what the user typed into a destination, or throws AuthInputError. */
export function toOtpDestination(channel: OtpChannel, value: string): OtpDestination {
  if (channel === 'phone') {
    const phoneE164 = normalizeIndianPhone(value);
    if (!phoneE164) throw new AuthInputError('invalid_phone');
    return { kind: 'phone', phoneE164 };
  }
  const email = value.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new AuthInputError('invalid_email');
  return { kind: 'email', email };
}

export class RequestOtp {
  constructor(private readonly auth: AuthRepository) {}

  async execute(channel: OtpChannel, value: string): Promise<OtpDestination> {
    const destination = toOtpDestination(channel, value);
    await this.auth.requestOtp(destination);
    return destination;
  }
}

export class VerifyOtp {
  constructor(private readonly auth: AuthRepository) {}

  execute(destination: OtpDestination, code: string): Promise<AuthSession> {
    const trimmed = code.replace(/\s/g, '');
    if (!CODE_RE.test(trimmed)) throw new AuthInputError('invalid_code');
    return this.auth.verifyOtp(destination, trimmed);
  }
}

export class SignOut {
  constructor(
    private readonly auth: AuthRepository,
    private readonly clearLocalShopState: () => Promise<void>,
  ) {}

  async execute(): Promise<void> {
    // Local shop state first, so a failed network sign-out still leaves nothing behind on the device.
    await this.clearLocalShopState();
    await this.auth.signOut();
  }
}

export class SignInWithPassword {
  constructor(private readonly auth: AuthRepository) {}
  execute(emailText: string, password: string): Promise<AuthSession> {
    const email = toEmail(emailText);
    if (password.length === 0) throw new AuthInputError('invalid_password');
    return this.auth.signInWithPassword(email, password);
  }
}

/** New account for a shop owner (the shop itself is created next, in onboarding). */
export class RegisterAccount {
  constructor(private readonly auth: AuthRepository) {}
  execute(input: { name: string; email: string; password: string; confirm: string }): Promise<SignUpResult> {
    const displayName = input.name.trim().replace(/\s+/g, ' ');
    if (displayName.length < 2 || displayName.length > 80) throw new AuthInputError('invalid_name');
    const email = toEmail(input.email);
    checkNewPassword(input.password, input.confirm);
    return this.auth.signUp({ email, password: input.password, displayName });
  }
}

export class RequestPasswordReset {
  constructor(private readonly auth: AuthRepository) {}
  async execute(emailText: string): Promise<string> {
    const email = toEmail(emailText);
    await this.auth.requestPasswordReset(email);
    return email;
  }
}

export class ResetPassword {
  constructor(private readonly auth: AuthRepository) {}
  execute(email: string, code: string, password: string, confirm: string): Promise<AuthSession> {
    const trimmed = code.replace(/\s/g, '');
    if (!CODE_RE.test(trimmed)) throw new AuthInputError('invalid_code');
    checkNewPassword(password, confirm);
    return this.auth.resetPassword(email, trimmed, password);
  }
}

/** Signed-in password change: the current password is checked first, so a borrowed phone cannot change it. */
export class ChangePassword {
  constructor(private readonly auth: AuthRepository) {}
  async execute(email: string, current: string, password: string, confirm: string): Promise<void> {
    if (current.length === 0) throw new AuthInputError('invalid_password');
    checkNewPassword(password, confirm);
    await this.auth.signInWithPassword(email, current);
    await this.auth.updatePassword(password);
  }
}
