import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getOperatorAccess } from '@/core/auth/requireOperator';
import { createAdminServerClient } from '@/core/supabase/server';
import { AuthShell } from '@/features/authentication/presentation/AuthShell';
import { MfaForm } from '@/features/authentication/presentation/MfaForm';
import { signOutAction } from '@/features/authentication/presentation/actions';
import { PLATFORM_ROLES } from '@ds/contracts';

/** Second step of operator sign-in: enrol or enter the TOTP code (sessions become aal2). */
export default async function MfaPage() {
  await connection();
  const decision = await getOperatorAccess(PLATFORM_ROLES);
  if (decision.kind === 'allowed') redirect('/');
  if (decision.kind !== 'mfa_required') redirect(`/login?reason=${decision.kind}`);
  const client = await createAdminServerClient();
  const factors = client ? await client.auth.mfa.listFactors() : null;
  const verified = factors?.data?.totp?.[0]?.id ?? null;

  return (
    <AuthShell
      title="Two-step verification"
      subtitle={<>Signed in as {decision.operator.email ?? decision.operator.userId}</>}
    >
      <MfaForm factorId={verified} />
      <form action={signOutAction}>
        <button type="submit" className="text-sm font-medium text-brand underline-offset-2 hover:underline">
          Use another account
        </button>
      </form>
    </AuthShell>
  );
}
