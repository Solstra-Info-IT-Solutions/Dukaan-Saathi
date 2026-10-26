import { z } from 'zod';
import { PaiseSchema, SignedPaiseSchema, UuidSchema } from './common';
import { SaleReturnSummarySchema } from './reports';

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
  lineDiscountPaise: PaiseSchema.optional(),
});

/** Product line: the server checks price, unit fractions, tax rate and stock (Phase 05). */
export const ProductSaleLineSchema = z.object({
  kind: z.literal('product'),
  productId: UuidSchema,
  quantityMilli: z.number().int().min(1).max(1_000_000_000),
  unitPricePaise: z.number().int().min(0).max(MAX_LINE_AMOUNT_PAISE),
  /** Set when the cashier deliberately changed the price; needs sale.price_override and the shop setting. */
  priceOverride: z.boolean().optional(),
  lineDiscountPaise: PaiseSchema.optional(),
  entryMode: z.enum(['quantity', 'amount']).optional(),
});

export const SaleLineInputSchema = z.discriminatedUnion('kind', [QuickSaleLineSchema, ProductSaleLineSchema]);

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
  lines: z.array(SaleLineInputSchema).min(1).max(MAX_BILL_LINES),
  billDiscountPaise: PaiseSchema.optional(),
  payments: z.array(SalePaymentInputSchema).max(10),
  /** Phase 08: the part of the total given on credit; needs customerId and udhaar.grant. */
  udhaarPaise: PaiseSchema.optional(),
  customerId: UuidSchema.optional(),
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
  /** e.g. NEGATIVE_STOCK when the shop's policy is "warn". */
  warnings: z
    .array(
      z.object({
        code: z.string(),
        productId: UuidSchema.optional(),
        stockOnHandMilli: z.number().int().optional(),
        /** CREDIT_LIMIT warnings (policy "warn"). */
        limitPaise: PaiseSchema.optional(),
        balancePaise: SignedPaiseSchema.optional(),
      }),
    )
    .optional(),
  /** Customer's balance after a credit bill. */
  customerBalancePaise: SignedPaiseSchema.nullable().optional(),
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
  hsnCode: z.string().nullable().optional(),
  priceOverridden: z.boolean().optional(),
  returnedQuantityMilli: z.number().int().optional(),
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
  voidedByName: z.string().nullable().optional(),
  lines: z.array(SaleLineSchema),
  payments: z.array(SalePaymentSchema),
  returns: z.array(SaleReturnSummarySchema).optional(),
  customer: z
    .object({
      id: UuidSchema,
      name: z.string(),
      phone: z.string().nullable(),
      balancePaise: SignedPaiseSchema,
    })
    .nullable()
    .optional(),
  businessDate: z.string().optional(),
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

export const VoidSaleInputSchema = z.object({
  clientOperationId: UuidSchema,
  shopId: UuidSchema,
  saleId: UuidSchema,
  reason: z.string().trim().min(3, 'REASON_TOO_SHORT').max(200, 'REASON_TOO_LONG'),
});
export type VoidSaleInput = z.infer<typeof VoidSaleInputSchema>;

export const SaleListItemSchema = z.object({
  saleId: UuidSchema,
  invoiceNumber: z.string(),
  createdAt: z.string(),
  status: z.enum(SALE_STATUSES),
  totalPaise: PaiseSchema,
  itemCount: z.number().int(),
  methods: z.array(z.enum(SALE_PAYMENT_METHODS)),
  createdByName: z.string().nullable(),
});
export type SaleListItemDto = z.infer<typeof SaleListItemSchema>;

export const SalePageSchema = z.object({
  items: z.array(SaleListItemSchema),
  nextCursor: z.string().nullable(),
});
export type SalePageDto = z.infer<typeof SalePageSchema>;
