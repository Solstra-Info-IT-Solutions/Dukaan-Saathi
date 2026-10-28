import 'server-only';
import { rpc } from '@/core/admin/rpc';
import type { AdminSupabaseClient } from '@/core/supabase/server';

export interface AuditEvent {
  id: number;
  occurredAt: string;
  actorKind: string;
  actor: string | null;
  shopId: string | null;
  shopName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
}

export interface AuditFilters {
  shopId: string | null;
  action: string | null;
  actorKind: string | null;
  beforeId: number | null;
}

/** Audit log, newest first (super_admin). */
export class AuditRepository {
  constructor(private readonly client: AdminSupabaseClient) {}

  list(f: AuditFilters, limit = 100) {
    return rpc<{ items: AuditEvent[]; nextBeforeId: number | null }>(this.client, 'admin_list_audit_log', {
      p_shop_id: f.shopId,
      p_action: f.action,
      p_actor_kind: f.actorKind,
      p_before_id: f.beforeId,
      p_limit: limit,
    });
  }
}
