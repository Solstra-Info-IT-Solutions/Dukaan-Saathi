import { describe, expect, it } from 'vitest';
import {
  allocateProportionally,
  computeBill,
  deviceCodeFromIndex,
  formatInvoiceNumber,
  formatPaise,
  formatQuantity,
  MoneyError,
  paise,
  parseInvoiceNumber,
  parseQuantity,
  parseRupeesToPaise,
  quantityForAmount,
  quantityMilli,
  roundHalfUpDiv,
  splitCgstSgst,
} from '../index';

describe('roundHalfUpDiv', () => {
  it('rounds half away from zero', () => {
    expect(roundHalfUpDiv(5n, 10n)).toBe(1);
    expect(roundHalfUpDiv(4n, 10n)).toBe(0);
    expect(roundHalfUpDiv(15n, 10n)).toBe(2);
    expect(roundHalfUpDiv(-5n, 10n)).toBe(-1);
    expect(roundHalfUpDiv(-4n, 10n)).toBe(0);
  });
  it('rejects division by zero', () => {
    expect(() => roundHalfUpDiv(1n, 0n)).toThrow(MoneyError);
  });
});

describe('paise', () => {
  it('rejects fractional and unsafe values', () => {
    expect(() => paise(1.5)).toThrow(MoneyError);
    expect(() => paise(Number.MAX_SAFE_INTEGER + 1)).toThrow(MoneyError);
  });
});

describe('parseRupeesToPaise', () => {
  it.each([
    ['40', 4000],
    ['1250.5', 125050],
    ['₹1,250.50', 125050],
    ['Rs. 99.9', 9990],
    ['0.05', 5],
  ])('%s → %d', (input, expected) => {
    expect(parseRupeesToPaise(input)).toBe(expected);
  });
  it.each(['', 'abc', '-5', '1.234', '1..2'])('rejects %s', (input) => {
    expect(parseRupeesToPaise(input)).toBeNull();
  });
});

describe('formatPaise', () => {
  it('uses Indian digit grouping', () => {
    expect(formatPaise(paise(12345650))).toBe('₹1,23,456.50');
    expect(formatPaise(paise(5))).toBe('₹0.05');
    expect(formatPaise(paise(-150000))).toBe('-₹1,500.00');
    expect(formatPaise(paise(100), { alwaysShowPaise: false })).toBe('₹1');
  });
});

describe('quantity', () => {
  it('parses and formats milli-units', () => {
    expect(parseQuantity('1.5')).toBe(1500);
    expect(parseQuantity('0.250')).toBe(250);
    expect(parseQuantity('2')).toBe(2000);
    expect(parseQuantity('1.2345')).toBeNull();
    expect(formatQuantity(quantityMilli(1500))).toBe('1.5');
    expect(formatQuantity(quantityMilli(3000))).toBe('3');
    expect(formatQuantity(quantityMilli(250))).toBe('0.25');
  });
  it('computes quantity for an amount without exceeding it', () => {
    // ₹40 of onions at ₹30/kg → 1.333 kg
    expect(quantityForAmount(paise(4000), paise(3000))).toBe(1333);
  });
});

describe('splitCgstSgst', () => {
  it('gives the odd paisa to CGST', () => {
    expect(splitCgstSgst(paise(153))).toEqual({ cgstPaise: 77, sgstPaise: 76 });
    expect(splitCgstSgst(paise(1800))).toEqual({ cgstPaise: 900, sgstPaise: 900 });
  });
});

describe('allocateProportionally', () => {
  it('always sums to the total', () => {
    const weights = [333, 333, 334, 1, 999].map(paise);
    const shares = allocateProportionally(paise(1001), weights);
    expect(shares.reduce((s, v) => s + v, 0)).toBe(1001);
  });
});

describe('computeBill guards', () => {
  const line = { unitPricePaise: paise(1000), quantityMilli: quantityMilli(1000) };
  it('rejects a bill discount larger than the bill', () => {
    expect(() =>
      computeBill({ lines: [line], billDiscountPaise: paise(1001), taxMode: 'none', roundOffEnabled: false }),
    ).toThrow(MoneyError);
  });
  it('rejects a line discount larger than the line', () => {
    expect(() =>
      computeBill({ lines: [{ ...line, lineDiscountPaise: paise(1001) }], taxMode: 'none', roundOffEnabled: false }),
    ).toThrow(MoneyError);
  });
  it('rejects zero quantity', () => {
    expect(() =>
      computeBill({ lines: [{ ...line, quantityMilli: quantityMilli(0) }], taxMode: 'none', roundOffEnabled: false }),
    ).toThrow(MoneyError);
  });
});

describe('invoice numbers', () => {
  it('formats and parses round-trip', () => {
    const parts = { prefix: 'DS', fy: '2627', deviceCode: 'B', seq: 123 };
    const formatted = formatInvoiceNumber(parts);
    expect(formatted).toBe('DS/2627/B-000123');
    expect(parseInvoiceNumber(formatted)).toEqual(parts);
  });
  it('rejects invalid parts', () => {
    expect(() => formatInvoiceNumber({ prefix: 'ds', fy: '2627', deviceCode: 'B', seq: 1 })).toThrow(RangeError);
    expect(() => formatInvoiceNumber({ prefix: 'DS', fy: '2627', deviceCode: 'B', seq: 0 })).toThrow(RangeError);
    expect(parseInvoiceNumber('DS-2627-B-1')).toBeNull();
  });
  it.each([
    [0, 'A'],
    [25, 'Z'],
    [26, 'AA'],
    [27, 'AB'],
    [701, 'ZZ'],
    [702, 'AAA'],
  ])('deviceCodeFromIndex(%d) = %s', (index, code) => {
    expect(deviceCodeFromIndex(index)).toBe(code);
  });
});
