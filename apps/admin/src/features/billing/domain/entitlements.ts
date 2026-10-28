/** Entitlement values as operators type them (FEATURE_CONFIGURATION.md §3). The database validates again. */

export type EntitlementValueType = 'boolean' | 'limit';
export type EntitlementValue = boolean | number | null;

export type Parsed<T> = { ok: true; value: T } | { ok: false };

/** "yes"/"no" for features; a whole number or "unlimited" (or empty) for limits. */
export function parseEntitlementInput(type: EntitlementValueType, text: string): Parsed<EntitlementValue> {
  const t = text.trim().toLowerCase();
  if (type === 'boolean') {
    if (['true', 'yes', 'on', '1'].includes(t)) return { ok: true, value: true };
    if (['false', 'no', 'off', '0'].includes(t)) return { ok: true, value: false };
    return { ok: false };
  }
  if (t === '' || t === 'unlimited' || t === '∞') return { ok: true, value: null };
  return /^\d{1,9}$/.test(t) ? { ok: true, value: Number(t) } : { ok: false };
}

export function formatEntitlement(value: EntitlementValue | undefined): string {
  if (value === undefined) return '—';
  if (value === null) return 'Unlimited';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** "₹ 1,299.50" / "1299.5" → 129950 paise. */
export function rupeesToPaise(text: string): Parsed<number> {
  const t = text.replace(/[₹,\s]/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return { ok: false };
  const [whole, frac = ''] = t.split('.');
  return { ok: true, value: Number(whole) * 100 + Number(frac.padEnd(2, '0')) };
}

/** JSON typed into the config editor. */
export function parseJson(text: string): Parsed<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** `datetime-local` (India time) → ISO; empty → null; invalid → undefined. */
export function istInputToIso(local: string): string | null | undefined {
  if (!local) return null;
  const d = new Date(`${local.length === 16 ? `${local}:00` : local}+05:30`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
