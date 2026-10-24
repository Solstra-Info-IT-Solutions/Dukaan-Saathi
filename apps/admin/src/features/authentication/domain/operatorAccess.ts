import { PLATFORM_ROLES, type PlatformRole } from '@ds/contracts';

/**
 * Pure access decision for admin pages (ADMIN_PANEL_SPECIFICATION.md §1, SECURITY_MODEL.md §3).
 * Deny by default: no backend, no session, no MFA, no active operator role, or the wrong role.
 */

export interface OperatorIdentity {
  userId: string;
  email: string | null;
  /** Authenticator assurance level from verified JWT claims. */
  aal: 'aal1' | 'aal2' | null;
  /** Active platform role, or null when the user is not an operator. */
  role: PlatformRole | null;
}

export type AccessDecision =
  | { kind: 'allowed'; operator: OperatorIdentity & { role: PlatformRole } }
  | { kind: 'backend_not_configured' }
  | { kind: 'signed_out' }
  | { kind: 'mfa_required'; operator: OperatorIdentity }
  | { kind: 'not_an_operator'; operator: OperatorIdentity }
  | { kind: 'role_not_permitted'; operator: OperatorIdentity };

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === 'string' && (PLATFORM_ROLES as readonly string[]).includes(value);
}

export function decideOperatorAccess(input: {
  backendConfigured: boolean;
  identity: OperatorIdentity | null;
  allowedRoles: readonly PlatformRole[];
}): AccessDecision {
  if (!input.backendConfigured) return { kind: 'backend_not_configured' };
  const identity = input.identity;
  if (!identity) return { kind: 'signed_out' };
  if (!identity.role) return { kind: 'not_an_operator', operator: identity };
  if (identity.aal !== 'aal2') return { kind: 'mfa_required', operator: identity };
  if (!input.allowedRoles.includes(identity.role)) return { kind: 'role_not_permitted', operator: identity };
  return { kind: 'allowed', operator: { ...identity, role: identity.role } };
}
