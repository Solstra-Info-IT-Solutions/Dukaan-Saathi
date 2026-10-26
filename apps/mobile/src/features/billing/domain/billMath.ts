import {
  basisPoints,
  computeBill,
  isDiscountWithinLimit,
  maxDiscountPaise,
  lineGross as coreLineGross,
  paise,
  parseQuantity,
  quantityForAmount,
  quantityMilli,
} from '@ds/domain-core';
import type { ShopRole } from '@ds/contracts';
import type {
  BillDraft,
  BillingSettings,
  BillLine,
  BillTotals,
  CatalogueProduct,
  CatalogueReference,
  PaymentMethod,
  ProductLine,
} from './entities/Bill';

/** Price, quantity, discount and tax rate of a line as create_sale computes it (quick line = amount × 1). */
function lineInput(line: BillLine) {
  if (line.kind === 'quick') {
    return { unitPricePaise: paise(line.amountPaise), quantityMilli: quantityMilli(1000) };
  }
  return {
    unitPricePaise: paise(line.unitPricePaise),
    quantityMilli: quantityMilli(line.quantityMilli),
    lineDiscountPaise: paise(line.lineDiscountPaise),
    taxRateBp: basisPoints(line.taxRateBp),
  };
}

/** Amount of one line before discounts. */
export function lineAmount(line: BillLine): number {
  return line.kind === 'quick'
    ? line.amountPaise
    : coreLineGross(paise(line.unitPricePaise), quantityMilli(line.quantityMilli));
}

/** Totals of a bill, computed exactly like create_sale does. */
/** The whole bill with per-line results (same rules as create_sale). */
export function draftBill(draft: BillDraft, settings: Pick<BillingSettings, 'taxMode' | 'roundOffEnabled'>) {
  return computeBill({
    taxMode: settings.taxMode,
    roundOffEnabled: settings.roundOffEnabled,
    billDiscountPaise: paise(draft.billDiscountPaise),
    lines: draft.lines.map(lineInput),
  });
}

export function draftTotals(
  draft: BillDraft,
  settings: Pick<BillingSettings, 'taxMode' | 'roundOffEnabled'>,
): BillTotals {
  const bill = draftBill(draft, settings);
  return {
    subtotalPaise: bill.subtotalPaise,
    discountPaise: bill.discountPaise,
    taxPaise: bill.taxPaise,
    roundOffPaise: bill.roundOffPaise,
    totalPaise: bill.totalPaise,
  };
}

/** Discount limit of a role in basis points; owners are not limited (BR-13). */
export function discountLimitBp(role: ShopRole, settings: BillingSettings): number {
  if (role === 'owner') return 10_000;
  return role === 'manager' ? settings.managerDiscountLimitBp : settings.cashierDiscountLimitBp;
}

export function discountAllowed(discountPaise: number, subtotalPaise: number, limitBp: number): boolean {
  return isDiscountWithinLimit(paise(discountPaise), paise(subtotalPaise), basisPoints(limitBp));
}

export function maxDiscount(subtotalPaise: number, limitBp: number): number {
  return maxDiscountPaise(paise(subtotalPaise), basisPoints(limitBp));
}

/** Change to give back for cash; null while the tendered amount does not cover the total. */
export function changeDue(tenderedPaise: number, totalPaise: number): number | null {
  return tenderedPaise >= totalPaise ? tenderedPaise - totalPaise : null;
}

/** UPI deep link for a static QR; shared with udhaar reminders (now in domain-core). */
export { upiPaymentUri } from '@ds/domain-core';

/** Keypad entry ("125.5") → paise; null for an empty or invalid entry. Two decimals at most. */
export function keypadToPaise(entry: string): number | null {
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(entry)) return null;
  const [rupees = '0', fraction = ''] = entry.split('.');
  const value = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  return value > 0 ? value : null;
}

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | '.' | 'back';

/** Applies one keypad press; ignores presses that would make the entry invalid. */
export function pressKeypad(entry: string, key: KeypadKey): string {
  if (key === 'back') return entry.slice(0, -1);
  const next = (entry + key).replace(/^\./, '0.').replace(/^0+(?=\d)/, '');
  return /^\d{0,7}(\.\d{0,2})?$/.test(next) ? next : entry;
}

/** One unit of a catalogue product as a bill line; tax rate and fraction rule come from the reference data. */
export function productLine(
  product: CatalogueProduct,
  reference: CatalogueReference,
  key: string,
): ProductLine {
  const unit = reference.units.find((u) => u.code === product.unitCode);
  const rate = reference.taxRates.find((t) => t.code === product.taxRateCode)?.rateBp ?? 0;
  return {
    kind: 'product',
    key,
    productId: product.id,
    name: product.name,
    unitCode: product.unitCode,
    allowsFraction: unit?.allowsFraction ?? false,
    listPricePaise: product.pricePaise,
    unitPricePaise: product.pricePaise,
    quantityMilli: 1000,
    taxRateBp: rate,
    lineDiscountPaise: 0,
    entryMode: 'quantity',
  };
}

/** Adds a product; scanning or tapping an item already on the bill adds one more unit to that line. */
export function addProductLine(lines: readonly BillLine[], line: ProductLine): BillLine[] {
  const same = lines.find(
    (l): l is ProductLine =>
      l.kind === 'product' &&
      l.productId === line.productId &&
      l.unitPricePaise === line.unitPricePaise &&
      l.lineDiscountPaise === 0,
  );
  if (!same) return [...lines, line];
  return lines.map((l) => (l === same ? { ...same, quantityMilli: same.quantityMilli + 1000 } : l));
}

/** Quantity typed by the user ("0.25", "2") → milli-units; null when invalid for the unit. */
export function quantityFromText(text: string, allowsFraction: boolean): number | null {
  const q = parseQuantity(text);
  if (q === null || q < 1 || (!allowsFraction && q % 1000 !== 0)) return null;
  return q;
}

/**
 * "₹40 ka pyaaz": quantity for an amount at the line's price, floored (whole units for piece items).
 * Null when the amount buys less than the smallest quantity.
 */
export function quantityFromAmount(line: ProductLine, amountPaise: number): number | null {
  if (line.unitPricePaise <= 0) return null;
  const q = quantityForAmount(paise(amountPaise), paise(line.unitPricePaise));
  const rounded = line.allowsFraction ? q : Math.floor(q / 1000) * 1000;
  return rounded >= 1 ? rounded : null;
}

/** True when the cashier changed the catalogue price on this line. */
export const isPriceOverride = (line: ProductLine) => line.unitPricePaise !== line.listPricePaise;

/**
 * Payments for a total: everything on one method, or a second method for part of it (the first method
 * takes the rest). Null when the split is not valid.
 */
export function splitPayments<M extends string = PaymentMethod>(
  totalPaise: number,
  primary: M,
  second: { method: M; amountPaise: number } | null,
): { method: M; amountPaise: number }[] | null {
  if (totalPaise === 0) return [];
  if (!second || second.amountPaise === 0) return [{ method: primary, amountPaise: totalPaise }];
  if (second.method === primary || second.amountPaise < 0 || second.amountPaise >= totalPaise) return null;
  return [{ method: primary, amountPaise: totalPaise - second.amountPaise }, second];
}
