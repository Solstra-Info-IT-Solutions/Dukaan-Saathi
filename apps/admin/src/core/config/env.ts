export interface AdminEnv {
  backend: { url: string; publishableKey: string } | null;
  issues: string[];
}

/** Validates the public Supabase settings. Refuses a secret key so it can never ship to the browser. */
export function parseAdminEnv(raw: { url?: string; key?: string }): AdminEnv {
  const url = raw.url?.trim() || undefined;
  const key = raw.key?.trim() || undefined;
  if (!url && !key) return { backend: null, issues: [] };
  if (!url || !key) {
    return { backend: null, issues: ['Both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required'] };
  }
  if (/service_role|sb_secret_/i.test(key)) {
    return { backend: null, issues: ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY looks like a secret key — refusing to use it'] };
  }
  if (!/^https?:\/\/.+/.test(url)) return { backend: null, issues: ['NEXT_PUBLIC_SUPABASE_URL is not a URL'] };
  return { backend: { url, publishableKey: key }, issues: [] };
}

export function readAdminEnv(): AdminEnv {
  return parseAdminEnv({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
