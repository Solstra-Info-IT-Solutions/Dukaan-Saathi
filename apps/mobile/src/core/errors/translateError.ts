import { isServerErrorCode } from '@ds/contracts';
import { AppError, isAppError } from './AppError';

/**
 * Maps anything thrown by a data source into an AppError (REPOSITORY_PATTERN.md §6):
 *  1. DS_* code raised by our SQL / Edge Functions
 *  2. Postgres / PostgREST codes
 *  3. network failures
 *  4. everything else → UNKNOWN
 */

interface PostgrestLikeError {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  name?: unknown;
}

function parseDetails(details: unknown): Record<string, unknown> | undefined {
  if (typeof details !== 'string' || details.length === 0) return undefined;
  try {
    const value: unknown = JSON.parse(details);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function translateError(error: unknown): AppError {
  if (isAppError(error)) return error;

  const e = (error ?? {}) as PostgrestLikeError;
  const message = typeof e.message === 'string' ? e.message : '';
  const code = typeof e.code === 'string' ? e.code : '';

  if (isServerErrorCode(message)) {
    return new AppError(message, { details: parseDetails(e.details), cause: error });
  }

  // Supabase Auth (GoTrue) error codes
  switch (code) {
    case 'otp_expired':
      return new AppError('AUTH_OTP_INVALID', { cause: error });
    case 'invalid_credentials':
      return new AppError('AUTH_INVALID_CREDENTIALS', { cause: error });
    case 'user_already_exists':
    case 'email_exists':
      return new AppError('AUTH_EMAIL_IN_USE', { cause: error });
    case 'weak_password':
      return new AppError('AUTH_WEAK_PASSWORD', { cause: error });
    case 'email_not_confirmed':
      return new AppError('AUTH_EMAIL_NOT_CONFIRMED', { cause: error });
    case 'same_password':
      return new AppError('AUTH_SAME_PASSWORD', { cause: error });
    case 'signup_disabled':
    case 'email_address_not_authorized':
      return new AppError('AUTH_SIGNUP_DISABLED', { cause: error });
    case 'phone_provider_disabled':
    case 'email_provider_disabled':
    case 'sms_send_failed':
    case 'otp_disabled':
      return new AppError('AUTH_PROVIDER_UNAVAILABLE', { cause: error });
    case 'over_request_rate_limit':
    case 'over_sms_send_rate_limit':
    case 'over_email_send_rate_limit':
      return new AppError('DS_RATE_LIMITED', { cause: error });
  }

  switch (code) {
    case '42501':
      return new AppError('DS_PERMISSION_DENIED', { cause: error });
    case '23505':
      return new AppError('DS_CONFLICT', { cause: error });
    case '23514':
    case '22P02':
      return new AppError('DS_VALIDATION_FAILED', { cause: error });
    case 'PGRST116':
      return new AppError('DS_NOT_FOUND', { cause: error });
    case 'PGRST301':
    case 'PGRST303':
      return new AppError('DS_AUTH_REQUIRED', { cause: error });
  }

  if (e.name === 'AbortError' || /timeout/i.test(message)) {
    return new AppError('NETWORK_TIMEOUT', { cause: error });
  }
  if (/network request failed|failed to fetch|network error/i.test(message)) {
    return new AppError('NETWORK_OFFLINE', { cause: error });
  }
  return new AppError('UNKNOWN', { cause: error });
}
