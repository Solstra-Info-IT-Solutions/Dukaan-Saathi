import {
  basisPoints,
  computeBill,
  isDiscountWithinLimit,
  maxDiscountPaise,
  paise,
  quantityMilli,
} from '@ds/domain-core';
import type { ShopRole } from '@ds/contracts';
import type { BillDraft, BillingSettings, BillTotals } from './entities/Bill';

/** Totals of a quick bill, computed exactly like create_sale does (one quick line = amount × 1). */
export function draftTotals(
  draft: BillDraft,
  settings: Pick<BillingSettings, 'taxMode' | 'roundOffEnabled'>,
): BillTotals {
  const bill = computeBill({
    taxMode: settings.taxMode,
    roundOffEnabled: settings.roundOffEnabled,
    billDiscountPaise: paise(draft.billDiscountPaise),
    lines: draft.lines.map((l) => ({
      unitPricePaise: paise(l.amountPaise),
      quantityMilli: quantityMilli(1000),
    })),
  });
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

/**
 * UPI deep link for a static QR (features/billing.md "UPI"). The shopkeeper confirms receipt by hand;
 * the app never claims the payment was verified.
 */
export function upiPaymentUri(input: {
  vpa: string;
  payeeName: string;
  amountPaise: number;
  note?: string;
}): string {
  const rupees = `${Math.floor(input.amountPaise / 100)}.${String(input.amountPaise % 100).padStart(2, '0')}`;
  const params = [
    `pa=${encodeURIComponent(input.vpa)}`,
    `pn=${encodeURIComponent(input.payeeName)}`,
    `am=${rupees}`,
    'cu=INR',
    ...(input.note ? [`tn=${encodeURIComponent(input.note)}`] : []),
  ];
  return `upi://pay?${params.join('&')}`;
}

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
