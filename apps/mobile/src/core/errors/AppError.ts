import { type ErrorCode, isRetryable } from '@ds/contracts';

/**
 * The only error shape the presentation layer sees (CLEAN_ARCHITECTURE.md §3).
 * `messageKey` is an i18n key under `errors.*`; raw backend messages never reach the UI.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly messageKey: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, options: { details?: Record<string, unknown>; cause?: unknown } = {}) {
    super(code, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.messageKey = `errors.${code}`;
    this.retryable = isRetryable(code);
    this.details = options.details;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
