import type { ReactNode } from 'react';
import { errorText } from '@/core/admin/rpc';

/**
 * Small shared pieces for admin pages (server components), styled only with the Brand Kit tokens mapped in
 * app/globals.css: forest for structure, action green (with a forest label) for the main action, white cards on the
 * light page, semantic colours only for status. Every status also carries text, never colour alone.
 */

export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-brand">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-2">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

/** Shows ?error=DS_… left by a server action, in plain words. */
export function ActionError({ code }: { code?: string }) {
  const text = errorText(code);
  return text ? <Alert tone="error">{text}</Alert> : null;
}

export function Notice({ text }: { text?: string | null }) {
  return text ? <Alert tone="success">{text}</Alert> : null;
}

type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand';

const ALERT: Record<Exclude<Tone, 'neutral' | 'brand'>, { box: string; label: string }> = {
  success: { box: 'border-success/30 bg-success-bg text-success', label: 'Done' },
  warning: { box: 'border-warning/30 bg-warning-bg text-warning', label: 'Note' },
  error: { box: 'border-error/30 bg-error-bg text-error', label: 'Problem' },
  info: { box: 'border-info/30 bg-info-bg text-info', label: 'Info' },
};

/** Status message with a word label as well as colour. Errors are announced immediately. */
export function Alert({ tone, children }: { tone: keyof typeof ALERT; children: ReactNode }) {
  const a = ALERT[tone];
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`mb-4 rounded-ds-md border px-4 py-3 text-sm ${a.box}`}
    >
      <span className="mr-2 font-semibold">{a.label}:</span>
      {children}
    </p>
  );
}

const BADGE: Record<Tone, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  error: 'bg-error-bg text-error',
  info: 'bg-info-bg text-info',
  neutral: 'bg-surface-soft text-ink-2 ring-1 ring-line',
  brand: 'bg-tint text-brand ring-1 ring-action-light',
};

/** Small status label (the text is the status; the colour only supports it). */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Key figure on a dashboard. */
export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className={card}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-2">{label}</p>
      <p className="mt-2 text-2xl font-bold text-brand">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-2">{hint}</p> : null}
    </div>
  );
}

/** Shown where a list has nothing in it. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-ds-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {hint ? <p className="mt-1 text-sm text-ink-2">{hint}</p> : null}
    </div>
  );
}

export { button, card, dangerButton, input, linkClass, secondaryButton, table, tableWrap } from './classes';
import { card } from './classes';

export const when = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(iso))
    : '—';

export const rupees = (paise: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    paise / 100,
  );
