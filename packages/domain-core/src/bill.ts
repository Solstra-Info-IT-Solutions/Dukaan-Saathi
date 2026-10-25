import { type BasisPoints, MoneyError, type Paise, paise, roundHalfUpDiv } from './money';
import { MILLI_PER_UNIT, type QuantityMilli } from './quantity';
import { taxFromInclusive } from './tax';

/**
 * Bill arithmetic (BR-03, BR-04, BR-05). Every function here has a SQL twin and both are tested
 * against fixtures/money-cases.json so the app and the database can never disagree on a total.
 */

export type TaxMode = 'none' | 'gst_regular' | 'gst_composition';

export interface BillLineInput {
  unitPricePaise: Paise;
  quantityMilli: QuantityMilli;
  lineDiscountPaise?: Paise;
  /** Tax rate snapshot for the line; ignored unless taxMode is gst_regular. */
  taxRateBp?: BasisPoints;
}

export interface BillLineResult {
  grossPaise: Paise;
  lineDiscountPaise: Paise;
  /** Share of the bill-level discount allocated to this line. */
  billDiscountSharePaise: Paise;
  /** Amount after line and bill discounts — what the customer pays for this line. */
  netPaise: Paise;
  taxPaise: Paise;
}

export interface BillTotals {
  lines: BillLineResult[];
  subtotalPaise: Paise;
  discountPaise: Paise;
  taxPaise: Paise;
  roundOffPaise: Paise;
  totalPaise: Paise;
}

/** round_half_up(price × qty / 1000). */
export function lineGross(unitPricePaise: Paise, quantity: QuantityMilli): Paise {
  if (unitPricePaise < 0) throw new MoneyError('Unit price cannot be negative');
  if (quantity <= 0) throw new MoneyError('Quantity must be positive');
  return paise(roundHalfUpDiv(BigInt(unitPricePaise) * BigInt(quantity), BigInt(MILLI_PER_UNIT)));
}

/**
 * Quantity bought for a rupee amount of a loose item ("₹40 ka pyaaz"): floor(amount × 1000 / price).
 * Floors so the computed line never exceeds the amount the customer asked for.
 */
export function quantityForAmount(amountPaise: Paise, unitPricePaise: Paise): QuantityMilli {
  if (unitPricePaise <= 0) throw new MoneyError('Unit price must be positive');
  return Number((BigInt(amountPaise) * BigInt(MILLI_PER_UNIT)) / BigInt(unitPricePaise)) as QuantityMilli;
}

/**
 * Splits `total` across `weights` proportionally using the largest-remainder method.
 * Deterministic: ties go to the earlier index. Sum of the result always equals `total`.
 */
export function allocateProportionally(total: Paise, weights: readonly Paise[]): Paise[] {
  const weightSum = weights.reduce<number>((s, w) => s + w, 0);
  if (weights.length === 0) return [];
  if (weightSum === 0) {
    return weights.map((_, i) => paise(i === 0 ? total : 0));
  }
  const floors = weights.map((w) => (BigInt(total) * BigInt(w)) / BigInt(weightSum));
  const remainders = weights.map((w, i) => ({
    index: i,
    remainder: (BigInt(total) * BigInt(w)) % BigInt(weightSum),
  }));
  let leftover = BigInt(total) - floors.reduce((s, f) => s + f, 0n);
  remainders.sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  const result = floors.slice();
  for (const { index } of remainders) {
    if (leftover <= 0n) break;
    result[index] = (result[index] ?? 0n) + 1n;
    leftover -= 1n;
  }
  return result.map((v) => paise(Number(v)));
}

export interface ComputeBillInput {
  lines: readonly BillLineInput[];
  billDiscountPaise?: Paise;
  taxMode: TaxMode;
  roundOffEnabled: boolean;
}

/**
 * Bill totals:
 *  1. gross per line = round_half_up(price × qty / 1000)
 *  2. line net before bill discount = gross − line discount
 *  3. bill discount allocated to lines in proportion to (2) (largest remainder)
 *  4. tax per line back-calculated from its final net amount (tax-inclusive prices)
 *  5. optional round-off of the total to the nearest rupee, half up
 */
export function computeBill(input: ComputeBillInput): BillTotals {
  const billDiscount = input.billDiscountPaise ?? paise(0);
  if (billDiscount < 0) throw new MoneyError('Bill discount cannot be negative');

  const beforeBillDiscount = input.lines.map((line) => {
    const gross = lineGross(line.unitPricePaise, line.quantityMilli);
    const lineDiscount = line.lineDiscountPaise ?? paise(0);
    if (lineDiscount < 0 || lineDiscount > gross) {
      throw new MoneyError('Line discount must be between zero and the line amount');
    }
    return { gross, lineDiscount, net: paise(gross - lineDiscount) };
  });

  const netSum = beforeBillDiscount.reduce<number>((s, l) => s + l.net, 0);
  if (billDiscount > netSum) throw new MoneyError('Bill discount cannot exceed the bill amount');

  const shares = allocateProportionally(
    billDiscount,
    beforeBillDiscount.map((l) => l.net),
  );

  const lines: BillLineResult[] = beforeBillDiscount.map((l, i) => {
    const share = shares[i] ?? paise(0);
    const net = paise(l.net - share);
    const rate = input.lines[i]?.taxRateBp;
    const tax = input.taxMode === 'gst_regular' && rate ? taxFromInclusive(net, rate) : paise(0);
    return {
      grossPaise: l.gross,
      lineDiscountPaise: l.lineDiscount,
      billDiscountSharePaise: share,
      netPaise: net,
      taxPaise: tax,
    };
  });

  const subtotal = lines.reduce<number>((s, l) => s + l.grossPaise, 0);
  const discount = lines.reduce<number>((s, l) => s + l.lineDiscountPaise + l.billDiscountSharePaise, 0);
  const tax = lines.reduce<number>((s, l) => s + l.taxPaise, 0);
  const raw = subtotal - discount;
  const rounded = input.roundOffEnabled ? roundHalfUpDiv(BigInt(raw), 100n) * 100 : raw;

  return {
    lines,
    subtotalPaise: paise(subtotal),
    discountPaise: paise(discount),
    taxPaise: paise(tax),
    roundOffPaise: paise(rounded - raw),
    totalPaise: paise(rounded),
  };
}

/**
 * Discount limit check (BR-13): discount / subtotal ≤ limit, compared exactly in integers.
 * Mirrors the check in create_sale; owners use a limit of 10000 bp (100 %).
 */
export function isDiscountWithinLimit(
  discountPaise: Paise,
  subtotalPaise: Paise,
  limitBp: BasisPoints,
): boolean {
  return BigInt(discountPaise) * 10_000n <= BigInt(limitBp) * BigInt(subtotalPaise);
}

/** Largest discount allowed on a subtotal: floor(subtotal × limit / 10000). */
export function maxDiscountPaise(subtotalPaise: Paise, limitBp: BasisPoints): Paise {
  return paise(Number((BigInt(subtotalPaise) * BigInt(limitBp)) / 10_000n));
}
