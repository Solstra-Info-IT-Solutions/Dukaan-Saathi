import { z } from 'zod';
import { IndianPhoneE164Schema, PaiseSchema, SignedPaiseSchema, UuidSchema } from './common';

/** Phase 07 contracts: stock, adjustments, counts, suppliers, purchases (features/inventory-and-purchases.md). */

const MethodSchema = z.enum(['cash', 'upi', 'card', 'other']);

export const StockItemSchema = z.object({
  productId: UuidSchema,
  name: z.string(),
  nameHi: z.string().nullable(),
  unitCode: z.string(),
  allowsFraction: z.boolean(),
  stockOnHandMilli: z.number().int(),
  lowStockThresholdMilli: z.number().int().nullable(),
  isLow: z.boolean(),
});
export type StockItemDto = z.infer<typeof StockItemSchema>;

export const STOCK_ADJUST_REASONS = ['damage', 'expiry', 'count_correction', 'opening', 'other'] as const;
export type StockAdjustReason = (typeof STOCK_ADJUST_REASONS)[number];

export const StockMovementSchema = z.object({
  id: UuidSchema,
  kind: z.enum(['sale', 'sale_void', 'sale_return', 'purchase', 'adjustment', 'opening', 'import']),
  quantityMilli: z.number().int(),
  reason: z.enum(STOCK_ADJUST_REASONS).nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type StockMovementDto = z.infer<typeof StockMovementSchema>;

export const AdjustStockInputSchema = z.object({
  clientOperationId: UuidSchema,
  shopId: UuidSchema,
  productId: UuidSchema,
  deltaMilli: z
    .number()
    .int()
    .refine((v) => v !== 0, 'ZERO'),
  reason: z.enum(STOCK_ADJUST_REASONS),
  note: z.string().trim().max(200).optional(),
});
export type AdjustStockInput = z.infer<typeof AdjustStockInputSchema>;
export const AdjustStockOutputSchema = z.object({
  movementId: UuidSchema,
  stockOnHandMilli: z.number().int(),
  replayed: z.boolean(),
});

export const StockCountInputSchema = z.object({
  clientOperationId: UuidSchema,
  shopId: UuidSchema,
  counts: z
    .array(z.object({ productId: UuidSchema, countedMilli: z.number().int().min(0) }))
    .min(1)
    .max(500),
  note: z.string().trim().max(200).optional(),
});
export type StockCountInput = z.infer<typeof StockCountInputSchema>;
export const StockCountOutputSchema = z.object({
  items: z.array(
    z.object({
      productId: UuidSchema,
      previousMilli: z.number().int(),
      countedMilli: z.number().int(),
      deltaMilli: z.number().int(),
    }),
  ),
  replayed: z.boolean(),
});
export type StockCountOutputDto = z.infer<typeof StockCountOutputSchema>;

export const SupplierSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  phone: z.string().nullable(),
  gstin: z.string().nullable(),
  note: z.string().nullable(),
  /** + = the shop owes the supplier. */
  balancePaise: SignedPaiseSchema,
  archivedAt: z.string().nullable(),
});
export type SupplierDto = z.infer<typeof SupplierSchema>;

export const SaveSupplierInputSchema = z.object({
  id: UuidSchema,
  shopId: UuidSchema,
  name: z.string().trim().min(1, 'NAME_REQUIRED').max(80, 'NAME_TOO_LONG'),
  phone: IndianPhoneE164Schema.optional(),
  gstin: z.string().optional(),
  note: z.string().trim().max(200).optional(),
  /** Only used when the supplier is created. */
  openingBalancePaise: SignedPaiseSchema.optional(),
});
export type SaveSupplierInput = z.infer<typeof SaveSupplierInputSchema>;

export const SupplierLedgerEntrySchema = z.object({
  id: UuidSchema,
  kind: z.enum(['opening', 'purchase', 'payment']),
  amountPaise: SignedPaiseSchema,
  method: MethodSchema.nullable(),
  purchaseId: UuidSchema.nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type SupplierLedgerEntryDto = z.infer<typeof SupplierLedgerEntrySchema>;

export const ReceivePurchaseInputSchema = z.object({
  clientOperationId: UuidSchema,
  shopId: UuidSchema,
  deviceId: UuidSchema.optional(),
  supplierId: UuidSchema.optional(),
  supplierInvoiceNo: z.string().trim().max(40).optional(),
  lines: z
    .array(
      z.object({
        productId: UuidSchema,
        quantityMilli: z.number().int().min(1),
        unitCostPaise: z.number().int().min(0).max(100_000_000),
      }),
    )
    .min(1)
    .max(200),
  payments: z.array(z.object({ method: MethodSchema, amountPaise: z.number().int().min(1) })).max(10),
  priceUpdates: z.array(z.object({ productId: UuidSchema, pricePaise: PaiseSchema })).optional(),
  note: z.string().trim().max(200).optional(),
});
export type ReceivePurchaseInput = z.infer<typeof ReceivePurchaseInputSchema>;
export const ReceivePurchaseOutputSchema = z.object({
  purchaseId: UuidSchema,
  totalPaise: PaiseSchema,
  paidPaise: PaiseSchema,
  supplierBalancePaise: SignedPaiseSchema.nullable(),
  replayed: z.boolean(),
});
export type ReceivePurchaseOutputDto = z.infer<typeof ReceivePurchaseOutputSchema>;

export const SupplierPaymentInputSchema = z.object({
  clientOperationId: UuidSchema,
  shopId: UuidSchema,
  supplierId: UuidSchema,
  deviceId: UuidSchema.optional(),
  amountPaise: z.number().int().min(1, 'AMOUNT_REQUIRED').max(100_000_000),
  method: MethodSchema,
  note: z.string().trim().max(200).optional(),
});
export type SupplierPaymentInput = z.infer<typeof SupplierPaymentInputSchema>;
export const SupplierPaymentOutputSchema = z.object({
  supplierId: UuidSchema,
  balancePaise: SignedPaiseSchema,
  replayed: z.boolean(),
});
