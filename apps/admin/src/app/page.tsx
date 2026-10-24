import { PLATFORM_ROLES } from '@ds/contracts';
import { requireOperator } from '@/core/auth/requireOperator';
import { signOutAction } from '@/features/authentication/presentation/actions';

export default async function DashboardPage() {
  const operator = await requireOperator(PLATFORM_ROLES);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-slate-600">
            Signed in as {operator.email ?? operator.userId} · {operator.role}
          </p>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            Sign out
          </button>
        </form>
      </header>
      <p className="mt-8 text-slate-700">
        Admin modules (shops, onboarding, plans, flags, support, audit) are built in Phase 11 and 12.
      </p>
    </main>
  );
}
