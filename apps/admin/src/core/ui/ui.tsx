import { errorText } from '@/core/admin/rpc';

/** Small shared pieces for admin pages (server components). */

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
    </div>
  );
}

/** Shows ?error=DS_… left by a server action, in plain words. */
export function ActionError({ code }: { code?: string }) {
  const text = errorText(code);
  return text ? (
    <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
      {text}
    </p>
  ) : null;
}

export function Notice({ text }: { text?: string | null }) {
  return text ? (
    <p role="status" className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
      {text}
    </p>
  ) : null;
}

export const input = 'rounded-md border border-slate-300 px-2 py-1 text-sm';
export const button =
  'rounded-md bg-emerald-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60';
export const dangerButton = 'rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white';
export const secondaryButton = 'rounded-md border border-slate-300 px-3 py-1.5 text-sm';
export const card = 'rounded-lg border border-slate-200 bg-white p-4';
export const table =
  'w-full text-left text-sm [&_td]:border-t [&_td]:border-slate-100 [&_td]:py-2 [&_td]:pr-3 [&_th]:pb-2 [&_th]:pr-3 [&_th]:font-medium [&_th]:text-slate-500';

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
