import 'server-only';
import type { PlatformRole } from '@ds/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOperator } from '@/core/auth/requireOperator';
import type { AdminSupabaseClient } from '@/core/supabase/server';
import { AdminRpcError, adminClient } from './rpc';

/** Adds or replaces a query parameter on an in-app path. */
export function withParam(path: string, key: string, value: string): string {
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set(key, value);
  return `${base}?${params.toString()}`;
}

/**
 * Body of every admin server action: re-check the operator (server actions are reachable by direct POST), run the
 * RPCs, refresh the page, and come back to `backTo` — with ?error=DS_… when the database refused.
 * `work` may return another path to go to on success.
 */
export async function adminAction(
  roles: readonly PlatformRole[],
  backTo: string,
  work: (client: AdminSupabaseClient) => Promise<string | void>,
): Promise<never> {
  await requireOperator(roles);
  const client = await adminClient();
  let next = backTo;
  let error: string | null = null;
  try {
    next = (await work(client)) ?? withParam(backTo, 'done', '1');
  } catch (e) {
    if (!(e instanceof AdminRpcError)) throw e;
    error = e.code;
  }
  revalidatePath(backTo.split('?')[0]!);
  redirect(error ? withParam(backTo, 'error', error) : next);
}

/** Trimmed text field from a form, or ''. */
export const field = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === 'string' ? v.trim() : '';
};
