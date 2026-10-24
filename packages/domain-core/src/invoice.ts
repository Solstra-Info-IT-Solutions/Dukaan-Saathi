/**
 * Invoice numbers (ADR-008, BR-10): `{prefix}/{fy}/{deviceCode}-{seq:06}`, e.g. "DS/2627/B-000123".
 * FY "2627" is 1 April 2026 – 31 March 2027 in the shop's time zone.
 */

export interface InvoiceNumberParts {
  prefix: string;
  fy: string;
  deviceCode: string;
  seq: number;
}

const PREFIX_RE = /^[A-Z0-9]{1,6}$/;
const DEVICE_CODE_RE = /^[A-Z]{1,3}$/;
const FY_RE = /^\d{4}$/;

export function isValidPrefix(prefix: string): boolean {
  return PREFIX_RE.test(prefix);
}

/** Year and month of an instant as seen in `timeZone` (default Asia/Kolkata). */
function localYearMonth(instant: Date, timeZone: string): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(instant);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  return { year, month };
}

/** Indian financial year code (April–March) for an instant: 2026-04-01 IST → "2627". */
export function financialYear(instant: Date, timeZone = 'Asia/Kolkata'): string {
  const { year, month } = localYearMonth(instant, timeZone);
  const startYear = month >= 4 ? year : year - 1;
  const a = (startYear % 100).toString().padStart(2, '0');
  const b = ((startYear + 1) % 100).toString().padStart(2, '0');
  return `${a}${b}`;
}

/** Device codes in registration order: 0 → "A", 25 → "Z", 26 → "AA", 27 → "AB". */
export function deviceCodeFromIndex(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new RangeError('Device index must be a non-negative integer');
  let n = index;
  let code = '';
  do {
    code = String.fromCharCode(65 + (n % 26)) + code;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return code;
}

export function formatInvoiceNumber(parts: InvoiceNumberParts): string {
  if (!PREFIX_RE.test(parts.prefix)) throw new RangeError(`Invalid invoice prefix "${parts.prefix}"`);
  if (!FY_RE.test(parts.fy)) throw new RangeError(`Invalid financial year "${parts.fy}"`);
  if (!DEVICE_CODE_RE.test(parts.deviceCode)) throw new RangeError(`Invalid device code "${parts.deviceCode}"`);
  if (!Number.isSafeInteger(parts.seq) || parts.seq < 1) throw new RangeError(`Invalid sequence ${parts.seq}`);
  return `${parts.prefix}/${parts.fy}/${parts.deviceCode}-${parts.seq.toString().padStart(6, '0')}`;
}

export function parseInvoiceNumber(value: string): InvoiceNumberParts | null {
  const match = /^([A-Z0-9]{1,6})\/(\d{4})\/([A-Z]{1,3})-(\d{1,12})$/.exec(value.trim());
  if (!match) return null;
  const [, prefix, fy, deviceCode, seq] = match;
  if (!prefix || !fy || !deviceCode || !seq) return null;
  return { prefix, fy, deviceCode, seq: Number(seq) };
}
