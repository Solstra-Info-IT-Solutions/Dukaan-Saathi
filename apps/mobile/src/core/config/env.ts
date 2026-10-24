import { z } from 'zod';

/**
 * Validated public environment. EXPO_PUBLIC_* values are inlined at build time and are PUBLIC —
 * never put secrets in them (SECURITY_MODEL.md §6).
 * The app runs without a backend when Supabase variables are absent (backend: null).
 */

const RawEnvSchema = z.object({
  EXPO_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  EXPO_PUBLIC_SUPABASE_URL: z.string().optional(),
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
});

export interface AppEnv {
  appEnv: 'development' | 'staging' | 'production';
  backend: { url: string; publishableKey: string } | null;
  /** Problems found while reading the environment; shown on the diagnostics screen. */
  issues: string[];
}

export function parseEnv(raw: Record<string, string | undefined>): AppEnv {
  const blankToUndefined = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === '' ? undefined : v]),
  );
  const parsed = RawEnvSchema.safeParse(blankToUndefined);
  if (!parsed.success) {
    return {
      appEnv: 'development',
      backend: null,
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }
  const {
    EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_SUPABASE_URL: url,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
  } = parsed.data;
  const issues: string[] = [];
  let backend: AppEnv['backend'] = null;

  if (url && key) {
    if (/^https?:\/\/.+/.test(url)) backend = { url, publishableKey: key };
    else issues.push('EXPO_PUBLIC_SUPABASE_URL is not a URL');
    if (/service_role|sb_secret_/i.test(key)) {
      // A secret key in a public bundle would bypass RLS for anyone who unpacks the app.
      backend = null;
      issues.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY looks like a secret key — refusing to use it');
    }
  } else if (url || key) {
    issues.push('Both EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required');
  }
  return { appEnv: EXPO_PUBLIC_APP_ENV, backend, issues };
}

/** Reads the bundled environment. Expo only inlines `process.env.EXPO_PUBLIC_*` accessed by full name. */
export function readEnv(): AppEnv {
  return parseEnv({
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
