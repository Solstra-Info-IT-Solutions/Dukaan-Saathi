import 'server-only';
import type { PlatformRole } from '@ds/contracts';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { readAdminEnv } from '@/core/config/env';
import { createAdminServerClient } from '@/core/supabase/server';
import { OperatorRepository } from '@/features/authentication/data/OperatorRepository';
import { type AccessDecision, decideOperatorAccess } from '@/features/authentication/domain/operatorAccess';

/** Resolves the access decision for the current request without redirecting. */
export async function getOperatorAccess(allowedRoles: readonly PlatformRole[]): Promise<AccessDecision> {
  // Guarded output depends on the request; it must never be prerendered into a static page.
  await connection();
  const env = readAdminEnv();
  const client = await createAdminServerClient();
  const identity = client ? await new OperatorRepository(client).getCurrentOperator() : null;
  return decideOperatorAccess({ backendConfigured: env.backend !== null, identity, allowedRoles });
}

/**
 * Guard for every admin page and server action. Redirects unless the operator is allowed.
 * UI checks are convenience only; admin RPCs enforce role + MFA again in the database.
 */
export async function requireOperator(allowedRoles: readonly PlatformRole[]) {
  const decision = await getOperatorAccess(allowedRoles);
  if (decision.kind === 'allowed') return decision.operator;
  // Operators without the second factor go to enrolment / the code prompt (Phase 11).
  if (decision.kind === 'mfa_required') redirect('/mfa');
  redirect(`/login?reason=${decision.kind}`);
}
