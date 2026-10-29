import { readAdminEnv } from '@/core/config/env';
import { Alert } from '@/core/ui/ui';
import { AuthShell } from '@/features/authentication/presentation/AuthShell';
import { LoginForm } from '@/features/authentication/presentation/LoginForm';

const REASON_TEXT: Record<string, string> = {
  signed_out: 'Please sign in to continue.',
  mfa_required: 'Two-step verification (TOTP) is required for operators.',
  not_an_operator: 'This account is not a platform operator.',
  role_not_permitted: 'Your operator role does not have access to that page.',
  backend_not_configured:
    'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to connect the admin panel.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const env = readAdminEnv();
  const message = reason ? REASON_TEXT[reason] : undefined;

  return (
    <AuthShell title="Sign in to Admin" subtitle="Use your operator email and password.">
      {message ? <Alert tone="warning">{message}</Alert> : null}
      {env.issues.map((issue) => (
        <Alert key={issue} tone="error">
          {issue}
        </Alert>
      ))}
      <LoginForm />
    </AuthShell>
  );
}
