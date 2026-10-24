import { z } from 'zod';
import { LocalizedTextSchema, UuidSchema } from './common';

/** Phase 03 RPC contracts (features/catalogue-and-imports.md). */

const PaiseOrNull = z.number().int().min(0).nullable();

export const ProductSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  nameHi: z.string().nullable(),
  categoryId: UuidSchema.nullable(),
  unitCode: z.string(),
  pricePaise: z.number().int().min(0),
  mrpPaise: PaiseOrNull,
  lastCostPaise: PaiseOrNull.optional(),
  taxRateCode: z.string().nullable(),
  hsnCode: z.string().nullable(),
  trackStock: z.boolean(),
  stockOnHandMilli: z.number().int(),
  lowStockThresholdMilli: z.number().int().nullable(),
  isActive: z.boolean(),
  barcodes: z.array(z.string()),
  aliases: z.array(z.string()),
  updatedAt: z.string(),
});
export type ProductDto = z.infer<typeof ProductSchema>;

export const ProductPageSchema = z.object({
  items: z.array(ProductSchema),
  nextOffset: z.number().int().nullable(),
});
export type ProductPageDto = z.infer<typeof ProductPageSchema>;

export const UnitSchema = z.object({
  code: z.string(),
  label: LocalizedTextSchema,
  allowsFraction: z.boolean(),
});
export const TaxRateSchema = z.object({ code: z.string(), rateBp: z.number().int(), label: z.string() });
export const CategorySchema = z.object({ id: UuidSchema, name: z.string(), nameHi: z.string().nullable() });
export type UnitDto = z.infer<typeof UnitSchema>;
export type TaxRateDto = z.infer<typeof TaxRateSchema>;
export type CategoryDto = z.infer<typeof CategorySchema>;

export const CatalogueReferenceSchema = z.object({
  units: z.array(UnitSchema),
  taxRates: z.array(TaxRateSchema),
  categories: z.array(CategorySchema),
});
export type CatalogueReferenceDto = z.infer<typeof CatalogueReferenceSchema>;

/** Input of save_product; mirrors the CHECK constraints so errors show before the round trip. */
export const SaveProductInputSchema = z.object({
  id: UuidSchema,
  name: z.string().trim().min(1, 'NAME_REQUIRED').max(120, 'NAME_TOO_LONG'),
  nameHi: z.string().trim().max(120, 'NAME_TOO_LONG').nullable(),
  categoryId: UuidSchema.nullable(),
  unitCode: z.string().min(1),
  pricePaise: z.number().int().min(0).max(100_000_000, 'PRICE_TOO_HIGH'),
  mrpPaise: z.number().int().min(0).max(100_000_000, 'PRICE_TOO_HIGH').nullable(),
  taxRateCode: z.string().nullable(),
  hsnCode: z
    .string()
    .regex(/^[0-9]{4,8}$/, 'INVALID_HSN')
    .nullable(),
  barcodes: z.array(z.string().regex(/^[A-Za-z0-9.-]{3,64}$/, 'INVALID_BARCODE')).max(10),
  aliases: z.array(z.string().trim().min(1).max(60)).max(20),
});
export type SaveProductInput = z.infer<typeof SaveProductInputSchema>;

export const IMPORT_JOB_STATUSES = ['draft', 'review', 'committed', 'cancelled'] as const;

export const ImportJobSummarySchema = z.object({
  jobId: UuidSchema,
  status: z.enum(IMPORT_JOB_STATUSES),
  fileName: z.string(),
  rowCount: z.number().int(),
  validCount: z.number().int(),
  errorCount: z.number().int(),
  createCount: z.number().int(),
  updateCount: z.number().int(),
  skipCount: z.number().int(),
  committedAt: z.string().nullable(),
});
export type ImportJobSummaryDto = z.infer<typeof ImportJobSummarySchema>;

export const CommitImportOutputSchema = z.object({
  jobId: UuidSchema,
  created: z.number().int(),
  updated: z.number().int(),
  replayed: z.boolean().optional(),
});
export type CommitImportOutputDto = z.infer<typeof CommitImportOutputSchema>;

/** Validation codes produced by private.validate_import_row. */
export const IMPORT_ROW_ERRORS = [
  'REQUIRED_NAME',
  'TOO_LONG_NAME',
  'REQUIRED_PRICE',
  'INVALID_PRICE',
  'INVALID_MRP',
  'UNKNOWN_UNIT',
  'UNKNOWN_TAX_RATE',
  'INVALID_HSN',
  'INVALID_BARCODE',
  'BARCODE_TAKEN',
  'DUPLICATE_IN_FILE',
] as const;
export type ImportRowError = (typeof IMPORT_ROW_ERRORS)[number];
