// admin-invite-operator (Phase 11, ADMIN_PANEL_SPECIFICATION.md "Operators").
// A super admin (signed in with MFA) invites a new platform operator by email:
//   1. the caller's own session must pass admin_list_operators (super_admin + aal2, checked in the database);
//   2. the invite email is sent with the service role (only this function holds it);
//   3. admin_add_operator runs as the caller, so the role grant is checked and audited like every admin change.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const ROLES = ['super_admin', 'billing_admin', 'onboarding_operator', 'support_agent', 'analyst'];
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED' });
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json(401, { code: 'DS_AUTH_REQUIRED' });

  let body: { email?: unknown; role?: unknown; redirectTo?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { code: 'DS_VALIDATION_FAILED', field: 'body' });
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = typeof body.role === 'string' ? body.role : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return json(400, { code: 'DS_VALIDATION_FAILED', field: 'email' });
  }
  if (!ROLES.includes(role)) return json(400, { code: 'DS_VALIDATION_FAILED', field: 'role' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  // 1. Only a super admin with MFA gets past this (DS_PERMISSION_DENIED / DS_MFA_REQUIRED otherwise).
  const guard = await asCaller.rpc('admin_list_operators');
  if (guard.error)
    return json(403, {
      code: guard.error.message.startsWith('DS_') ? guard.error.message : 'DS_PERMISSION_DENIED',
    });

  // 2. Invite (or find) the auth user.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const redirectTo =
    typeof body.redirectTo === 'string' && body.redirectTo.startsWith('https://')
      ? body.redirectTo
      : undefined;
  let userId: string | null = null;
  const invited = await admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
  if (invited.data.user) {
    userId = invited.data.user.id;
  } else {
    // Already registered: look the user up (first 1000 users is plenty for the operator team).
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list.data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    if (!userId) return json(502, { code: 'DS_INTERNAL', reason: 'invite_failed' });
  }

  // 3. Grant the role as the caller (checked + audited in SQL).
  const granted = await asCaller.rpc('admin_add_operator', { p_user_id: userId, p_role: role });
  if (granted.error) return json(400, { code: granted.error.message });
  return json(200, { userId, email, role, invited: !!invited.data.user });
});
