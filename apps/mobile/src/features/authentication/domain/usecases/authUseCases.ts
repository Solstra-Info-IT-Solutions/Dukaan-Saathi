import { normalizeIndianPhone } from '@ds/contracts';
import type { AuthSession, OtpChannel, OtpDestination } from '../entities/AuthSession';
import { AuthInputError } from '../errors';
import type { AuthRepository } from '../repositories/AuthRepository';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CODE_RE = /^\d{6,8}$/;

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
