/**
 * The single error-code catalogue (API_AND_RPC_CONTRACTS.md §2).
 * SQL functions raise these exact strings as the exception message; Edge Functions return them in
 * `{ error: { code } }`. Client-only codes are listed separately.
 */

export const SERVER_ERROR_CODES = [
  'DS_AUTH_REQUIRED',
  'DS_MFA_REQUIRED',
  'DS_NOT_A_MEMBER',
  'DS_PERMISSION_DENIED',
  'DS_SHOP_SUSPENDED',
  'DS_ENTITLEMENT_REQUIRED',
  'DS_QUOTA_EXCEEDED',
  'DS_FEATURE_DISABLED',
  'DS_VALIDATION_FAILED',
  'DS_IDEMPOTENCY_CONFLICT',
  'DS_TOTAL_MISMATCH',
  'DS_PRODUCT_INACTIVE',
  'DS_INSUFFICIENT_STOCK',
  'DS_CUSTOMER_REQUIRED',
  'DS_CREDIT_LIMIT_EXCEEDED',
  'DS_DISCOUNT_LIMIT_EXCEEDED',
  'DS_PRICE_OVERRIDE_DENIED',
  'DS_SALE_ALREADY_VOIDED',
  'DS_VOID_WINDOW_EXPIRED',
  'DS_DEVICE_NOT_REGISTERED',
  'DS_INVOICE_SEQUENCE_CONFLICT',
  'DS_APP_VERSION_UNSUPPORTED',
  'DS_CONFIG_INVALID',
  'DS_RATE_LIMITED',
  'DS_MAINTENANCE',
  'DS_NOT_FOUND',
  'DS_CONFLICT',
  'DS_INTERNAL',
] as const;

export const CLIENT_ERROR_CODES = [
  'NETWORK_OFFLINE',
  'NETWORK_TIMEOUT',
  // Supabase Auth failures (not raised by our SQL)
  'AUTH_OTP_INVALID',
  'AUTH_PROVIDER_UNAVAILABLE',
  'BACKEND_NOT_CONFIGURED',
  'UNKNOWN',
] as const;

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];
export type ErrorCode = ServerErrorCode | ClientErrorCode;

const serverCodes: ReadonlySet<string> = new Set(SERVER_ERROR_CODES);

export function isServerErrorCode(value: unknown): value is ServerErrorCode {
  return typeof value === 'string' && serverCodes.has(value);
}

/** Codes where retrying the same request (same client_operation_id) can succeed. */
export const RETRYABLE_ERROR_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'DS_RATE_LIMITED',
  'DS_MAINTENANCE',
  'DS_INTERNAL',
  'NETWORK_OFFLINE',
  'NETWORK_TIMEOUT',
]);

export function isRetryable(code: ErrorCode): boolean {
  return RETRYABLE_ERROR_CODES.has(code);
}
