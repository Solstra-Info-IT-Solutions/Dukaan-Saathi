import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, type AppStateStatus } from 'react-native';
import type { Database } from '@ds/contracts';
import type { AppEnv } from '../config/env';
import type { KeyValueStorage } from '../storage/secureStorage';

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Creates the single Supabase client for the app. Only the publishable key is used;
 * every query is authorised by RLS on the server.
 */
export function createSupabaseClient(
  backend: NonNullable<AppEnv['backend']>,
  storage: KeyValueStorage,
  appVersion = '0.0.0',
): TypedSupabaseClient {
  return createClient<Database>(backend.url, backend.publishableKey, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    // The app version lets the server refuse writes from unsupported versions (public.check_request).
    global: { headers: { 'x-ds-client': 'mobile', 'x-ds-app-version': appVersion } },
  });
}

/** Refreshes tokens only while the app is in the foreground. Returns an unsubscribe function. */
export function bindAuthRefreshToAppState(client: TypedSupabaseClient): () => void {
  const onChange = (state: AppStateStatus) => {
    if (state === 'active') void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  };
  const subscription = AppState.addEventListener('change', onChange);
  return () => subscription.remove();
}
