/**
 * Quantity is an integer number of milli-units (BR-02): 1 kg = 1000, 1 piece = 1000, 250 g of a kg item = 250.
 */

declare const quantityBrand: unique symbol;
export type QuantityMilli = number & { readonly [quantityBrand]: true };

export const MILLI_PER_UNIT = 1000;

export class QuantityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuantityError';
  }
}

export function quantityMilli(value: number): QuantityMilli {
  if (!Number.isSafeInteger(value)) {
    throw new QuantityError(`Quantity must be a safe integer of milli-units, got ${value}`);
  }
  return value as QuantityMilli;
}

export function wholeUnits(units: number): QuantityMilli {
  return quantityMilli(units * MILLI_PER_UNIT);
}

/** Parses "2", "1.5", "0.250" into milli-units without floating point; at most 3 decimals. */
export function parseQuantity(input: string): QuantityMilli | null {
  const match = /^(\d+)(?:\.(\d{0,3}))?$/.exec(input.trim());
  if (!match) return null;
  const whole = Number(match[1] ?? '0');
  const fraction = Number((match[2] ?? '').padEnd(3, '0'));
  const value = whole * MILLI_PER_UNIT + fraction;
  return Number.isSafeInteger(value) ? quantityMilli(value) : null;
}

/** 1500 → "1.5", 3000 → "3", 250 → "0.25". */
export function formatQuantity(value: QuantityMilli): string {
  const whole = Math.trunc(value / MILLI_PER_UNIT);
  const fraction = Math.abs(value % MILLI_PER_UNIT);
  if (fraction === 0) return whole.toString();
  return `${whole}.${fraction.toString().padStart(3, '0').replace(/0+$/, '')}`;
}

export function isWholeQuantity(value: QuantityMilli): boolean {
  return value % MILLI_PER_UNIT === 0;
}
