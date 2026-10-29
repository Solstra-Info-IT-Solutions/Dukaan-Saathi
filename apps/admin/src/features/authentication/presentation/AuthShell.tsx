import Image from 'next/image';
import type { ReactNode } from 'react';

/** Centred card for the sign-in steps: stacked logo (kit 600×520) over a white card on the light page. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-sm">
        <Image
          src="/brand/logo-stacked.svg"
          alt="Dukaan Saathi — Har Dukaan Ka Saathi"
          width={240}
          height={208}
          priority
          unoptimized
          className="mx-auto"
        />
        <div className="mt-2 rounded-ds-lg border border-line bg-surface p-6 shadow-card">
          <h1 className="text-xl font-bold text-brand">{title}</h1>
          {subtitle ? <div className="mt-1 text-sm text-ink-2">{subtitle}</div> : null}
          <div className="mt-6 flex flex-col gap-4">{children}</div>
        </div>
        <p className="mt-6 text-center text-xs text-ink-2">
          Platform operators only · every action is recorded
        </p>
      </div>
    </main>
  );
}
