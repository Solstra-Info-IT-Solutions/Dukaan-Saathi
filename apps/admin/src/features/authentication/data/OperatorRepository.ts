import 'server-only';
import type { AdminSupabaseClient } from '@/core/supabase/server';
import { isPlatformRole, type OperatorIdentity } from '../domain/operatorAccess';

/**
 * Reads the signed-in operator's verified identity and platform role.
 * Identity comes from verified JWT claims (getClaims), never from the unverified session object.
 * The role comes from `get_my_platform_role()` (migration p01_baseline), which reads `platform_admins`
 * for auth.uid() only.
 */
export class OperatorRepository {
  constructor(private readonly client: AdminSupabaseClient) {}

  async getCurrentOperator(): Promise<OperatorIdentity | null> {
    const { data, error } = await this.client.auth.getClaims();
    if (error || !data?.claims) return null;
    const claims = data.claims;
    const aal = claims.aal === 'aal2' ? 'aal2' : claims.aal === 'aal1' ? 'aal1' : null;

    const { data: role, error: roleError } = await this.client.rpc('get_my_platform_role');
    return {
      userId: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : null,
      aal,
      // Any failure to read the role is treated as "not an operator" (deny by default).
      role: !roleError && isPlatformRole(role) ? role : null,
    };
  }

  async signInWithPassword(email: string, password: string): Promise<{ ok: true } | { ok: false }> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    return error ? { ok: false } : { ok: true };
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}
