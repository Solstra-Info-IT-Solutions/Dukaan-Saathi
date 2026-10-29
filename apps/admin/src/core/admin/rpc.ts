import 'server-only';
import { redirect } from 'next/navigation';
import type { AdminSupabaseClient } from '@/core/supabase/server';
import { createAdminServerClient } from '@/core/supabase/server';

/** An admin RPC refused the call; `code` is the DS_* error code (or UNKNOWN). */
export class AdminRpcError extends Error {
  constructor(
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'AdminRpcError';
  }
}

/** The signed-in operator's client; pages and actions call requireOperator() first. */
export async function adminClient(): Promise<AdminSupabaseClient> {
  const client = await createAdminServerClient();
  if (!client) redirect('/login?reason=backend_not_configured');
  return client;
}

/**
 * Calls an admin RPC as the operator. The database checks role + MFA and audits; errors come back as DS_* codes.
 * Names are not in the hand-maintained generated types for every admin RPC, so the call is typed loosely here and
 * each repository states the shape it returns.
 */
export async function rpc<T>(
  client: AdminSupabaseClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await (
    client.rpc as unknown as (
      f: string,
      a: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string; details?: string } | null }>
  )(fn, args);
  if (error) {
    let details: Record<string, unknown> = {};
    try {
      details = error.details ? (JSON.parse(error.details) as Record<string, unknown>) : {};
    } catch {
      details = {};
    }
    throw new AdminRpcError(/^DS_[A-Z_]+$/.test(error.message) ? error.message : 'UNKNOWN', details);
  }
  return data as T;
}

/** Plain-language text for error codes shown in the panel. */
export const ERROR_TEXT: Record<string, string> = {
  DS_PERMISSION_DENIED: 'Your operator role cannot do that.',
  DS_MFA_REQUIRED: 'Two-step verification is required. Sign in again with your authenticator code.',
  DS_VALIDATION_FAILED: 'Some of the values are not valid. Check them and try again.',
  DS_CONFLICT: 'That is not possible in the current state.',
  DS_NOT_FOUND: 'Not found. It may have been removed.',
  DS_QUOTA_EXCEEDED: 'The shop’s plan limit was reached.',
  DS_AUTH_REQUIRED: 'Your session ended. Sign in again.',
  DS_RATE_LIMITED: 'Too many tries in a short time. Wait a few minutes and try again.',
  DS_MAINTENANCE: 'Maintenance is on and saving is paused.',
  DS_ENTITLEMENT_REQUIRED: 'The shop’s plan does not include this.',
  UNKNOWN: 'Something went wrong. Try again.',
};

export const errorText = (code: string | undefined) =>
  code ? (ERROR_TEXT[code] ?? ERROR_TEXT.UNKNOWN) : null;
