/**
 * Maps spreadsheet columns to product import fields (features/catalogue-and-imports.md "Import rules").
 * Header names are matched case-insensitively against English and Hindi synonyms. Values are passed
 * through as typed; the server parses and validates them (stage_import_rows).
 */

export const IMPORT_FIELDS = [
  'name',
  'nameHi',
  'category',
  'unit',
  'price',
  'mrp',
  'taxRate',
  'hsn',
  'barcode',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export const REQUIRED_IMPORT_FIELDS: readonly ImportField[] = ['name', 'price'];

const SYNONYMS: Record<ImportField, readonly string[]> = {
  name: ['name', 'product', 'product name', 'item', 'item name', 'naam', 'नाम', 'सामान', 'उत्पाद'],
  nameHi: ['hindi name', 'name hindi', 'name_hi', 'name (hindi)', 'हिंदी नाम', 'हिन्दी नाम'],
  category: ['category', 'group', 'type', 'श्रेणी', 'कैटेगरी', 'प्रकार'],
  unit: ['unit', 'uom', 'units', 'इकाई', 'यूनिट'],
  price: ['price', 'selling price', 'sale price', 'rate', 'sp', 'दाम', 'कीमत', 'रेट', 'मूल्य'],
  mrp: ['mrp', 'm.r.p', 'm.r.p.', 'एमआरपी'],
  taxRate: ['gst', 'gst %', 'gst%', 'tax', 'tax rate', 'tax %', 'जीएसटी'],
  hsn: ['hsn', 'hsn code', 'hsn/sac'],
  barcode: ['barcode', 'bar code', 'ean', 'ean code', 'upc', 'बारकोड'],
};

const normaliseHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ');

const lookup = new Map<string, ImportField>();
for (const field of IMPORT_FIELDS) for (const s of SYNONYMS[field]) lookup.set(normaliseHeader(s), field);

export type ImportRowInput = { rowNumber: number } & Partial<Record<ImportField, string>>;

export interface MappedImport {
  /** Column index → field, for columns that were recognised. */
  columns: Partial<Record<number, ImportField>>;
  unmappedHeaders: string[];
  missingRequired: ImportField[];
  rows: ImportRowInput[];
}

/**
 * Turns parsed CSV (first row = headers) into import rows. Row numbers are spreadsheet line numbers
 * (header = 1), so errors point to the line the shopkeeper sees. Fully blank lines are dropped.
 */
export function mapImportTable(table: readonly (readonly string[])[]): MappedImport {
  const [header = [], ...body] = table;
  const columns: Partial<Record<number, ImportField>> = {};
  const used = new Set<ImportField>();
  const unmappedHeaders: string[] = [];

  header.forEach((h, index) => {
    const field = lookup.get(normaliseHeader(h));
    if (field && !used.has(field)) {
      columns[index] = field;
      used.add(field);
    } else if (h.trim() !== '') {
      unmappedHeaders.push(h.trim());
    }
  });

  const rows: ImportRowInput[] = [];
  body.forEach((cells, i) => {
    if (cells.every((c) => c.trim() === '')) return;
    const row: ImportRowInput = { rowNumber: i + 2 };
    cells.forEach((cell, index) => {
      const field = columns[index];
      const value = cell.trim();
      if (field && value !== '') row[field] = value;
    });
    rows.push(row);
  });

  return {
    columns,
    unmappedHeaders,
    missingRequired: REQUIRED_IMPORT_FIELDS.filter((f) => !used.has(f)),
    rows,
  };
}

/** Splits rows into batches for stage_import_rows (server accepts at most 1000 per call). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new RangeError('size must be positive');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
