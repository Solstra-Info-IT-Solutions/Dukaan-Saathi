import type { AppEnv } from '@/core/config/env';

export interface HealthDto {
  ok: boolean;
  latencyMs: number;
}

export type FetchLike = (input: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean }>;

/**
 * Calls the Supabase Auth health endpoint with the publishable key. It needs no session and
 * touches no tenant data, so it is safe to run before sign-in.
 */
export class SupabaseHealthDataSource {
  constructor(
    private readonly backend: NonNullable<AppEnv['backend']>,
    private readonly fetchFn: FetchLike = (input, init) => fetch(input, init),
    private readonly timeoutMs = 8000,
  ) {}

  async check(): Promise<HealthDto> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();
    try {
      const response = await this.fetchFn(`${this.backend.url.replace(/\/$/, '')}/auth/v1/health`, {
        headers: { apikey: this.backend.publishableKey },
        signal: controller.signal,
      });
      return { ok: response.ok, latencyMs: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }
}
