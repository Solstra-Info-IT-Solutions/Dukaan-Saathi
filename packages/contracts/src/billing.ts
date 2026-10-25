import { z } from 'zod';
import { PaiseSchema, SignedPaiseSchema, UuidSchema } from './common';

/** Phase 04 sale contracts (API_AND_RPC_CONTRACTS.md §5.1, features/billing.md). */

export const SALE_PAYMENT_METHODS = ['cash', 'upi', 'card', 'other'] as const;
export type SalePaymentMethod = (typeof SALE_PAYMENT_METHODS)[number];
export const SALE_STATUSES = ['completed', 'needs_review', 'voided'] as const;
export const SALE_SOURCES = ['keypad', 'search', 'scan', 'voice'] as const;

/** Largest single amount accepted on a line: ₹10,00,000. */
export const MAX_LINE_AMOUNT_PAISE = 100_000_000;
export const MAX_BILL_LINES = 200;

export const BillTotalsSchema = z.object({
  subtotalPaise: PaiseSchema,
  discountPaise: PaiseSchema,
  taxPaise: PaiseSchema,
  roundOffPaise: SignedPaiseSchema,
  totalPaise: PaiseSchema,
});
export type BillTotalsDto = z.infer<typeof BillTotalsSchema>;

export const QuickSaleLineSchema = z.object({
  kind: z.literal('quick'),
  label: z.string().trim().max(60).optional(),
  amountPaise: z.number().int().min(1).max(MAX_LINE_AMOUNT_PAISE),
});

export const SalePaymentInputSchema = z.object({
  method: z.enum(SALE_PAYMENT_METHODS),
  amountPaise: z.number().int().min(1),
  reference: z.string().trim().max(40).optional(),
});

export const CreateSaleInputSchema = z.object({
  clientOperationId: UuidSchema,
  shopId: UuidSchema,
  deviceId: UuidSchema,
  invoice: z.object({ fy: z.string().regex(/^\d{4}$/), seq: z.number().int().min(1) }),
  occurredAt: z.iso.datetime({ offset: true }),
  origin: z.literal('online'),
  source: z.enum(SALE_SOURCES).optional(),
  lines: z.array(QuickSaleLineSchema).min(1).max(MAX_BILL_LINES),
  billDiscountPaise: PaiseSchema.optional(),
  payments: z.array(SalePaymentInputSchema).max(10),
  clientTotals: BillTotalsSchema,
  note: z.string().trim().max(200).optional(),
});
export type CreateSaleInput = z.infer<typeof CreateSaleInputSchema>;

export const CreateSaleOutputSchema = z.object({
  saleId: UuidSchema,
  invoiceNumber: z.string(),
  seq: z.number().int(),
  status: z.enum(SALE_STATUSES),
  reviewReasons: z.array(z.string()),
  totals: BillTotalsSchema,
  replayed: z.boolean(),
});
export type CreateSaleOutputDto = z.infer<typeof CreateSaleOutputSchema>;

export const SaleLineSchema = z.object({
  lineNo: z.number().int(),
  kind: z.enum(['quick', 'product']),
  productId: UuidSchema.nullable(),
  label: z.string().nullable(),
  unitCode: z.string().nullable(),
  quantityMilli: z.number().int(),
  unitPricePaise: PaiseSchema,
  grossPaise: PaiseSchema,
  lineDiscountPaise: PaiseSchema,
  billDiscountSharePaise: PaiseSchema,
  netPaise: PaiseSchema,
  taxRateBp: z.number().int(),
  taxPaise: PaiseSchema,
});

export const SalePaymentSchema = z.object({
  method: z.enum(SALE_PAYMENT_METHODS),
  amountPaise: PaiseSchema,
  reference: z.string().nullable(),
  confirmation: z.literal('manual').nullable(),
});

/** Output of get_sale: everything a receipt needs. */
export const SaleSchema = z.object({
  saleId: UuidSchema,
  shopId: UuidSchema,
  invoiceNumber: z.string(),
  status: z.enum(SALE_STATUSES),
  reviewReasons: z.array(z.string()),
  occurredAt: z.string(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
  taxMode: z.enum(['none', 'gst_regular', 'gst_composition']),
  totals: BillTotalsSchema,
  billDiscountPaise: PaiseSchema,
  paidPaise: PaiseSchema,
  udhaarPaise: PaiseSchema,
  note: z.string().nullable(),
  voidedAt: z.string().nullable(),
  voidReason: z.string().nullable(),
  lines: z.array(SaleLineSchema),
  payments: z.array(SalePaymentSchema),
  shop: z.object({
    name: z.string(),
    addressLine: z.string().nullable(),
    city: z.string().nullable(),
    pincode: z.string().nullable(),
    phone: z.string().nullable(),
    gstin: z.string().nullable(),
    upiVpa: z.string().nullable(),
  }),
});
export type SaleDto = z.infer<typeof SaleSchema>;
