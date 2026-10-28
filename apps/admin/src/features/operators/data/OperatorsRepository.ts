import 'server-only';
import type { PlatformRole } from '@ds/contracts';
import { AdminRpcError, rpc } from '@/core/admin/rpc';
import type { AdminSupabaseClient } from '@/core/supabase/server';

export interface Operator {
  userId: string;
  email: string | null;
  role: PlatformRole;
  status: 'active' | 'disabled';
  createdAt: string;
  mfaEnrolled: boolean;
}

/** Platform operators (super_admin). */
export class OperatorsRepository {
  constructor(private readonly client: AdminSupabaseClient) {}

  list() {
    return rpc<Operator[]>(this.client, 'admin_list_operators', {});
  }

  setRole(userId: string, role: PlatformRole | null, status: Operator['status'] | null, reason: string) {
    return rpc(this.client, 'admin_set_operator_role', {
      p_user_id: userId,
      p_role: role,
      p_status: status,
      p_reason: reason,
    });
  }

  /** Sends the invite email and grants the role (admin-invite-operator Edge Function holds the service key). */
  async invite(email: string, role: PlatformRole, redirectTo?: string) {
    const { data, error } = await this.client.functions.invoke<{ code?: string; userId?: string }>(
      'admin-invite-operator',
      { body: { email, role, ...(redirectTo ? { redirectTo } : {}) } },
    );
    if (error) {
      let code = 'UNKNOWN';
      try {
        const body = (await (error as { context?: Response }).context?.json()) as
          { code?: string } | undefined;
        if (body?.code && /^DS_[A-Z_]+$/.test(body.code)) code = body.code;
      } catch {
        // not JSON (e.g. the function is not deployed yet)
      }
      throw new AdminRpcError(code);
    }
    return data;
  }
}
