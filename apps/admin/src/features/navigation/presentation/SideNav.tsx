'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** True when `href` is the current page or one of its sub-pages ("/" only matches itself). */
export function isActive(href: string, pathname: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The modules this operator may open (filtered on the server by role). The current one is marked with
 * aria-current, a pale-green background and an action-green bar — not by colour alone (bold text too).
 */
export function SideNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin modules">
      <ul className="flex flex-col gap-1">
        {items.map((m) => {
          const active = isActive(m.href, pathname);
          return (
            <li key={m.href}>
              <Link
                href={m.href}
                // In the phone menu (a <details>), close it after choosing a page.
                onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-10 items-center rounded-ds-sm border-l-4 px-3 text-sm transition-colors ${
                  active
                    ? 'border-action bg-tint font-semibold text-brand'
                    : 'border-transparent text-ink-2 hover:bg-surface-soft hover:text-brand'
                }`}
              >
                {m.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
