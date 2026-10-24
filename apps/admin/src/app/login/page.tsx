import { readAdminEnv } from '@/core/config/env';
import { LoginForm } from '@/features/authentication/presentation/LoginForm';

const REASON_TEXT: Record<string, string> = {
  signed_out: 'Please sign in to continue.',
  mfa_required: 'Two-step verification (TOTP) is required for operators. MFA enrolment arrives in Phase 11.',
  not_an_operator: 'This account is not a platform operator.',
  role_not_permitted: 'Your operator role does not have access to that page.',
  backend_not_configured: 'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to connect the admin panel.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const env = readAdminEnv();
  const message = reason ? REASON_TEXT[reason] : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-bold">Dukaan Saathi Admin</h1>
        <p className="text-sm text-slate-600">Platform operators only.</p>
      </div>
      {message ? (
        <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {message}
        </p>
      ) : null}
      {env.issues.map((issue) => (
        <p key={issue} role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {issue}
        </p>
      ))}
      <LoginForm />
    </main>
  );
}
