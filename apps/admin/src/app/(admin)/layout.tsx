import { PLATFORM_ROLES } from '@ds/contracts';
import Image from 'next/image';
import Link from 'next/link';
import { requireOperator } from '@/core/auth/requireOperator';
import { Badge, secondaryButton } from '@/core/ui/ui';
import { signOutAction } from '@/features/authentication/presentation/actions';
import { modulesFor } from '@/features/navigation/domain/modules';
import { SideNav } from '@/features/navigation/presentation/SideNav';

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super admin',
  billing_admin: 'Billing',
  onboarding_operator: 'Onboarding',
  support_agent: 'Support',
  analyst: 'Analyst',
};

/**
 * Every admin page: operator with MFA (checked again by each page for its own roles, and by every RPC).
 * Desktop: white sidebar with the horizontal logo. Narrow screens: top bar with the logo mark and a menu.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const operator = await requireOperator(PLATFORM_ROLES);
  const items = modulesFor(operator.role).map(({ href, label }) => ({ href, label }));
  const who = operator.email ?? operator.userId;

  const signOut = (
    <form action={signOutAction}>
      <button type="submit" className={`${secondaryButton} w-full`}>
        Sign out
      </button>
    </form>
  );

  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-ds-sm focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen">
        <Link href="/" className="block px-5 pb-4 pt-6" aria-label="Dukaan Saathi Admin — dashboard">
          {/* Kit file 1000×260; its right-hand clear space is part of the artwork. */}
          <Image
            src="/brand/logo-horizontal.svg"
            alt="Dukaan Saathi"
            width={200}
            height={52}
            priority
            unoptimized
          />
          <span className="mt-1 block pl-[46px] text-xs font-semibold uppercase tracking-wider text-ink-2">
            Admin
          </span>
        </Link>
        <div className="flex-1 overflow-y-auto px-3">
          <SideNav items={items} />
        </div>
        <div className="flex flex-col gap-2 border-t border-line p-4">
          <p className="truncate text-xs text-ink-2" title={who}>
            {who}
          </p>
          <Badge tone="brand">{ROLE_LABEL[operator.role] ?? operator.role}</Badge>
          {signOut}
        </div>
      </aside>

      <header className="sticky top-0 z-40 border-b border-line bg-surface lg:hidden">
        <div className="flex items-center gap-3 px-4 py-2">
          <Link href="/" className="flex items-center gap-2" aria-label="Dukaan Saathi Admin — dashboard">
            <Image src="/brand/icon-transparent.svg" alt="" width={32} height={32} priority unoptimized />
            <span className="font-bold text-brand">Admin</span>
          </Link>
          <details className="group relative ml-auto">
            <summary className={`${secondaryButton} cursor-pointer list-none`}>Menu</summary>
            <div className="absolute right-0 mt-2 w-64 rounded-ds-md border border-line bg-surface p-3 shadow-modal">
              <SideNav items={items} />
              <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                <p className="truncate text-xs text-ink-2">{who}</p>
                {signOut}
              </div>
            </div>
          </details>
        </div>
      </header>

      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
