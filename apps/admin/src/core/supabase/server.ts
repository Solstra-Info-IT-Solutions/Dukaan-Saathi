import 'server-only';
import type { Database } from '@ds/contracts';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { readAdminEnv } from '../config/env';

export type AdminSupabaseClient = SupabaseClient<Database>;

/**
 * Supabase client for Server Components, Server Actions and Route Handlers, acting as the signed-in
 * operator (cookie session). Returns null when the backend is not configured.
 */
export async function createAdminServerClient(): Promise<AdminSupabaseClient | null> {
  const { backend } = readAdminEnv();
  if (!backend) return null;
  const cookieStore = await cookies();
  return createServerClient<Database>(backend.url, backend.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
