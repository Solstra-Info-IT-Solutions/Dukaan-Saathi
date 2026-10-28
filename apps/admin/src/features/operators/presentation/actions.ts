'use server';

import { PLATFORM_ROLES, type PlatformRole } from '@ds/contracts';
import { headers } from 'next/headers';
import { adminAction, field } from '@/core/admin/action';
import { AdminRpcError } from '@/core/admin/rpc';
import { OperatorsRepository } from '../data/OperatorsRepository';

const ROLES = ['super_admin'] as const;
const isRole = (v: string): v is PlatformRole => (PLATFORM_ROLES as readonly string[]).includes(v);

/** Change an operator's role or disable/enable them. A reason is required and audited; you cannot change yourself. */
export async function setOperatorAction(form: FormData) {
  return adminAction(ROLES, '/operators', async (client) => {
    const role = field(form, 'role');
    const status = field(form, 'status');
    const reason = field(form, 'reason');
    if (reason.length < 5) throw new AdminRpcError('DS_VALIDATION_FAILED');
    await new OperatorsRepository(client).setRole(
      field(form, 'userId'),
      isRole(role) ? role : null,
      status === 'active' || status === 'disabled' ? status : null,
      reason,
    );
  });
}

export async function inviteOperatorAction(form: FormData) {
  return adminAction(ROLES, '/operators', async (client) => {
    const email = field(form, 'email').toLowerCase();
    const role = field(form, 'role');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !isRole(role))
      throw new AdminRpcError('DS_VALIDATION_FAILED');
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    // The invite link lands on the panel's sign-in page (https only; local dev uses the Supabase default).
    const redirectTo = host && !host.startsWith('localhost') ? `https://${host}/login` : undefined;
    await new OperatorsRepository(client).invite(email, role, redirectTo);
  });
}
