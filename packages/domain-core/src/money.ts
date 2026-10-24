/**
 * Money is always an integer number of paise (BR-01, ADR-004).
 * Intermediate products (price × quantity) can exceed Number.MAX_SAFE_INTEGER, so
 * multiplication/division goes through BigInt and the result is checked back into a safe integer.
 */

declare const paiseBrand: unique symbol;
export type Paise = number & { readonly [paiseBrand]: true };

declare const bpBrand: unique symbol;
/** Basis points: 1 % = 100 bp. Used for tax rates and discount limits. */
export type BasisPoints = number & { readonly [bpBrand]: true };

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export function paise(value: number): Paise {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Paise must be a safe integer, got ${value}`);
  }
  return value as Paise;
}

export function basisPoints(value: number): BasisPoints {
  if (!Number.isInteger(value) || value < 0 || value > 100_00) {
    throw new MoneyError(`Basis points must be an integer in 0..10000, got ${value}`);
  }
  return value as BasisPoints;
}

export const ZERO_PAISE = 0 as Paise;

export function addPaise(...values: Paise[]): Paise {
  return paise(values.reduce<number>((total, v) => total + v, 0));
}

export function subtractPaise(a: Paise, b: Paise): Paise {
  return paise(a - b);
}

function toSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new MoneyError(`Result ${value} is outside the safe integer range`);
  }
  return Number(value);
}

/**
 * Integer division rounding half away from zero — the single rounding rule used everywhere (BR-03).
 * Mirrored by private.round_half_up_div in SQL.
 */
export function roundHalfUpDiv(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) throw new MoneyError('Division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (n * 2n + d) / (d * 2n);
  return toSafeNumber(negative ? -quotient : quotient);
}

/**
 * Parses a rupee amount typed or imported by a person ("₹1,250.50", "1250.5", "40") into paise
 * without floating point. Returns null when the text is not a valid non-negative amount.
 */
export function parseRupeesToPaise(input: string): Paise | null {
  const cleaned = input.replace(/[₹\s,]/g, '').replace(/^rs\.?/i, '');
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const rupees = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const value = Number(rupees) * 100 + Number(fraction);
  return Number.isSafeInteger(value) ? paise(value) : null;
}

/** Groups digits the Indian way: 12345678 → "1,23,45,678". */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** Formats paise as rupees with Indian grouping: 12345650 → "₹1,23,456.50". */
export function formatPaise(value: Paise, options: { symbol?: boolean; alwaysShowPaise?: boolean } = {}): string {
  const { symbol = true, alwaysShowPaise = true } = options;
  const negative = value < 0;
  const abs = Math.abs(value);
  const rupees = Math.floor(abs / 100).toString();
  const fraction = (abs % 100).toString().padStart(2, '0');
  const showFraction = alwaysShowPaise || fraction !== '00';
  const body = `${groupIndian(rupees)}${showFraction ? `.${fraction}` : ''}`;
  return `${negative ? '-' : ''}${symbol ? '₹' : ''}${body}`;
}
