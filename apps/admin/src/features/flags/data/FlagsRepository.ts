import 'server-only';
import { rpc } from '@/core/admin/rpc';
import type { AdminSupabaseClient } from '@/core/supabase/server';

export interface Flag {
  key: string;
  description: string;
  enabled: boolean;
  rolloutPercent: number;
  minAppVersion: string | null;
  killSwitchable: boolean;
  revision: number;
  updatedAt: string;
  updatedBy: string | null;
  overrides: { shopId: string; shopName: string; value: boolean; reason: string; expiresAt: string | null }[];
}

export interface ConfigEntry {
  key: string;
  value: unknown;
  revision: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface Revision {
  id: number;
  revision: number;
  value: unknown;
  changedAt: string;
  changedBy: string | null;
}

/** Feature flags and platform config with revisions (super_admin; analysts read flags). */
export class FlagsRepository {
  constructor(private readonly client: AdminSupabaseClient) {}

  listFlags() {
    return rpc<Flag[]>(this.client, 'admin_list_flags', {});
  }

  saveFlag(
    input: Partial<Pick<Flag, 'description' | 'enabled' | 'rolloutPercent' | 'killSwitchable'>> & {
      key: string;
      minAppVersion?: string;
    },
    reason: string,
  ) {
    return rpc(this.client, 'admin_save_flag', { p_input: input, p_reason: reason });
  }

  listConfig() {
    return rpc<ConfigEntry[]>(this.client, 'admin_list_config', {});
  }

  setConfig(key: string, value: unknown, expectedRevision: number, reason: string) {
    return rpc(this.client, 'admin_set_config', {
      p_key: key,
      p_value: value,
      p_expected_revision: expectedRevision,
      p_reason: reason,
    });
  }

  revisions(kind: 'platform_config' | 'feature_flag', key: string) {
    return rpc<Revision[]>(this.client, 'admin_list_config_revisions', { p_kind: kind, p_key: key });
  }

  restore(revisionId: number, reason: string) {
    return rpc(this.client, 'admin_restore_revision', { p_revision_id: revisionId, p_reason: reason });
  }
}
