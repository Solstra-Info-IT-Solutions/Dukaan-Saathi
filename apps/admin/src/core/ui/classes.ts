/**
 * Brand class strings (Tailwind names for the Brand Kit tokens in app/globals.css). Plain constants so client and
 * server components can both use them; ui.tsx re-exports them with the shared components.
 */
const control = 'min-h-10 rounded-ds-sm border border-ink-2 bg-surface px-3 py-2 text-sm text-ink'; // field edge 4.8:1 (WCAG 1.4.11)
export const input = `${control} placeholder:text-ink-muted focus-visible:border-brand`;

const buttonBase =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-ds-sm px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
/** Main action: action green with a forest label (5.3:1 contrast). */
export const button = `${buttonBase} bg-action text-brand hover:bg-action-light`;
export const dangerButton = `${buttonBase} bg-error text-white hover:opacity-90`;
export const secondaryButton = `${buttonBase} border border-line bg-surface text-brand hover:bg-tint`;
export const linkClass = 'font-medium text-brand underline-offset-2 hover:underline';

export const card = 'rounded-ds-lg border border-line bg-surface p-5 shadow-card';
export const table =
  'w-full text-left text-sm [&_td]:border-t [&_td]:border-line [&_td]:py-3 [&_td]:pr-4 [&_th]:bg-surface-soft [&_th]:py-2.5 [&_th]:pr-4 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-ink-2 [&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_tbody_tr:hover]:bg-tint';
/** Wraps a table so it scrolls sideways on narrow screens instead of overflowing the page. */
export const tableWrap = 'overflow-x-auto rounded-ds-lg border border-line bg-surface shadow-card';
