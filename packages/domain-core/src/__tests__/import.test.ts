import { describe, expect, it } from 'vitest';
import { chunk, detectDelimiter, mapImportTable, parseCsv } from '../index';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas inside quotes and CRLF', () => {
    const text = 'name,price\r\n"Atta, 5kg",250\r\n"Rice ""Basmati""",120\r\n';
    expect(parseCsv(text)).toEqual([
      ['name', 'price'],
      ['Atta, 5kg', '250'],
      ['Rice "Basmati"', '120'],
    ]);
  });
  it('strips a UTF-8 BOM and keeps Hindi text', () => {
    expect(parseCsv('﻿नाम,दाम\nचीनी,45')).toEqual([
      ['नाम', 'दाम'],
      ['चीनी', '45'],
    ]);
  });
  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('name,note\n"A","line1\nline2"')).toEqual([
      ['name', 'note'],
      ['A', 'line1\nline2'],
    ]);
  });
  it('keeps empty trailing fields', () => {
    expect(parseCsv('a,b,c\n1,,')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', ''],
    ]);
  });
  it('detects semicolon and tab delimiters', () => {
    expect(detectDelimiter('name;price;mrp\nA;1;2')).toBe(';');
    expect(detectDelimiter('name\tprice\nA\t1')).toBe('\t');
    expect(detectDelimiter('"a;b",c\n')).toBe(',');
    expect(parseCsv('name;price\nA;1')).toEqual([
      ['name', 'price'],
      ['A', '1'],
    ]);
  });
});

describe('mapImportTable', () => {
  it('maps English and Hindi headers and numbers rows like the spreadsheet', () => {
    const mapped = mapImportTable([
      ['Item Name', 'दाम', 'Unit', 'Barcode', 'Supplier'],
      ['Sugar', '45', 'kg', '8901234567890', 'Ramesh'],
      ['', '', '', '', ''],
      ['Salt', '28', '', '', ''],
    ]);
    expect(mapped.missingRequired).toEqual([]);
    expect(mapped.unmappedHeaders).toEqual(['Supplier']);
    expect(mapped.rows).toEqual([
      { rowNumber: 2, name: 'Sugar', price: '45', unit: 'kg', barcode: '8901234567890' },
      { rowNumber: 4, name: 'Salt', price: '28' },
    ]);
  });
  it('reports missing required columns', () => {
    expect(mapImportTable([['Product', 'MRP']]).missingRequired).toEqual(['price']);
  });
  it('uses only the first column for a duplicated field', () => {
    const mapped = mapImportTable([
      ['name', 'price', 'rate'],
      ['A', '1', '2'],
    ]);
    expect(mapped.rows[0]).toEqual({ rowNumber: 2, name: 'A', price: '1' });
    expect(mapped.unmappedHeaders).toEqual(['rate']);
  });
});

describe('chunk', () => {
  it('splits into batches', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(() => chunk([1], 0)).toThrow(RangeError);
  });
});
