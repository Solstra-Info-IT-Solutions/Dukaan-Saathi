import { describe, expect, it } from 'vitest';
import cases from '../../fixtures/money-cases.json';
import {
  allocateProportionally,
  basisPoints,
  computeBill,
  financialYear,
  lineGross,
  paise,
  quantityMilli,
  taxFromInclusive,
  type TaxMode,
} from '../index';

describe('shared money fixtures (same file is run by pgTAP)', () => {
  it.each(cases.lineGross)('lineGross($unitPricePaise × $quantityMilli) = $expected', (c) => {
    expect(lineGross(paise(c.unitPricePaise), quantityMilli(c.quantityMilli))).toBe(c.expected);
  });

  it.each(cases.taxFromInclusive)('taxFromInclusive($amountPaise @ $rateBp bp) = $expected', (c) => {
    expect(taxFromInclusive(paise(c.amountPaise), basisPoints(c.rateBp))).toBe(c.expected);
  });

  it.each(cases.allocate)('allocate $total over $weights', (c) => {
    expect(allocateProportionally(paise(c.total), c.weights.map(paise))).toEqual(c.expected);
  });

  it.each(cases.bills)('bill: $name', (c) => {
    const result = computeBill({
      taxMode: c.taxMode as TaxMode,
      roundOffEnabled: c.roundOffEnabled,
      billDiscountPaise: paise(c.billDiscountPaise),
      lines: c.lines.map((l) => ({
        unitPricePaise: paise(l.unitPricePaise),
        quantityMilli: quantityMilli(l.quantityMilli),
        lineDiscountPaise: paise('lineDiscountPaise' in l ? l.lineDiscountPaise : 0),
        ...('taxRateBp' in l ? { taxRateBp: basisPoints(l.taxRateBp) } : {}),
      })),
    });
    expect({
      subtotalPaise: result.subtotalPaise,
      discountPaise: result.discountPaise,
      taxPaise: result.taxPaise,
      roundOffPaise: result.roundOffPaise,
      totalPaise: result.totalPaise,
    }).toEqual(c.expected);
    expect(result.lines.reduce((s, l) => s + l.netPaise, 0) + result.roundOffPaise).toBe(result.totalPaise);
  });

  it.each(cases.financialYear)('financialYear($instant) = $expected', (c) => {
    expect(financialYear(new Date(c.instant))).toBe(c.expected);
  });
});
