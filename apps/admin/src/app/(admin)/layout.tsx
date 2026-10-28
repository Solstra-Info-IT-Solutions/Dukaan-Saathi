import { PLATFORM_ROLES } from '@ds/contracts';
import Link from 'next/link';
import { requireOperator } from '@/core/auth/requireOperator';
import { signOutAction } from '@/features/authentication/presentation/actions';
import { modulesFor } from '@/features/navigation/domain/modules';

/** Every admin page: operator with MFA (checked again by each page for its own roles, and by every RPC). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const operator = await requireOperator(PLATFORM_ROLES);
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="font-bold">Dukaan Saathi Admin</span>
          <nav className="flex flex-wrap gap-3 text-sm">
            {modulesFor(operator.role).map((m) => (
              <Link key={m.href} href={m.href} className="text-slate-700 hover:text-emerald-800">
                {m.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto text-xs text-slate-500">
            {operator.email ?? operator.userId} · {operator.role}
          </span>
          <form action={signOutAction}>
            <button type="submit" className="rounded-md border border-slate-300 px-2 py-1 text-xs">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
