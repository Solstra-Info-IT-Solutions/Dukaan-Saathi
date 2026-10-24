import { z } from 'zod';
import { LocalizedTextSchema, SemverSchema } from './common';
import { FEATURE_FLAGS, type FeatureFlagKey } from './features';

/**
 * Output of get_client_config (API_AND_RPC_CONTRACTS.md §5.7). The schema only adds optional fields
 * over time (FEATURE_CONFIGURATION.md §8) so older apps keep parsing newer payloads; unknown keys are ignored.
 */

export const MaintenanceSchema = z.object({
  active: z.boolean(),
  message: LocalizedTextSchema,
  blocksWrites: z.boolean().default(false),
});

export const AnnouncementSchema = z.object({
  id: z.string(),
  title: LocalizedTextSchema,
  body: LocalizedTextSchema,
  severity: z.enum(['info', 'warning', 'critical']),
  endsAt: z.string().nullable().optional(),
});

const flagsShape = Object.fromEntries(FEATURE_FLAGS.map((k) => [k, z.boolean().optional()])) as Record<
  FeatureFlagKey,
  z.ZodOptional<z.ZodBoolean>
>;

export const ClientConfigSchema = z.object({
  revision: z.string(),
  minSupportedAppVersion: SemverSchema,
  latestAppVersion: SemverSchema.optional(),
  refreshSeconds: z.number().int().min(300).max(86_400).default(900),
  maintenance: MaintenanceSchema.optional(),
  flags: z.object(flagsShape).default({}),
  announcements: z.array(AnnouncementSchema).default([]),
  content: z.record(z.string(), LocalizedTextSchema).default({}),
});
export type ClientConfig = z.infer<typeof ClientConfigSchema>;

/** Bundled defaults used before the first successful fetch and when a fetched payload is invalid. */
export const DEFAULT_CLIENT_CONFIG: ClientConfig = {
  revision: 'bundled',
  minSupportedAppVersion: '0.0.0',
  refreshSeconds: 900,
  flags: {},
  announcements: [],
  content: {},
};

/** Returns the parsed config, or the fallback (last good / bundled) when the payload is invalid. */
export function parseClientConfig(payload: unknown, fallback: ClientConfig = DEFAULT_CLIENT_CONFIG): {
  config: ClientConfig;
  valid: boolean;
} {
  const parsed = ClientConfigSchema.safeParse(payload);
  return parsed.success ? { config: parsed.data, valid: true } : { config: fallback, valid: false };
}

/** Compares "1.2.10" with "1.10.0". Returns negative, zero or positive. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
