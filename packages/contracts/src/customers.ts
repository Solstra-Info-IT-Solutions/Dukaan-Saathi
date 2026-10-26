import { z } from 'zod';
import { IndianPhoneE164Schema, PaiseSchema, SignedPaiseSchema, UuidSchema } from './common';

/** Phase 08 contracts: customers, udhaar ledger, repayments, adjustments (features/customers-and-udhaar.md). */

const MethodSchema = z.enum(['cash', 'upi', 'card', 'other']);

export const CustomerSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  phone: z.string().nullable(),
  note: z.string().nullable(),
  creditLimitPaise: PaiseSchema.nullable(),
  /** + = the customer owes the shop; − = advance. */
  balancePaise: SignedPaiseSchema,
  /** When the balance last went above 0 (for "oldest first"). */
  udhaarSince: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type CustomerDto = z.infer<typeof CustomerSchema>;

export const CUSTOMER_SORTS = ['name', 'highest', 'oldest'] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export const CustomerListSchema = z.object({
  rows: z.array(CustomerSchema),
  /** Whole shop, not just the rows returned. */
  totalOutstandingPaise: PaiseSchema,
  customersWithUdhaar: z.number().int(),
});
export type CustomerListDto = z.infer<typeof CustomerListSchema>;

export const SaveCustomerInputSchema = z.object({
  id: UuidSchema,
  shopId: UuidSchema,
  name: z.string().trim().min(1, 'NAME_REQUIRED').max(80, 'NAME_TOO_LONG'),
  phone: IndianPhoneE164Schema.optional(),
  note: z.string().trim().max(200).optional(),
  /** Needs customer.manage. */
  creditLimitPaise: PaiseSchema.max(100_000_000).optional(),
  /** Only used when the customer is created; needs customer.manage. */
  openingBalancePaise: SignedPaiseSchema.optional(),
});
export type SaveCustomerInput = z.infer<typeof SaveCustomerInputSchema>;

export const CUSTOMER_LEDGER_KINDS = [
  'opening',
  'sale',
  'repayment',
  'sale_void',
  'sale_return',
  'adjustment',
] as const;
export type CustomerLedgerKind = (typeof CUSTOMER_LEDGER_KINDS)[number];

export const CustomerLedgerEntrySchema = z.object({
  id: UuidSchema,
  kind: z.enum(CUSTOMER_LEDGER_KINDS),
  amountPaise: SignedPaiseSchema,
  balanceAfterPaise: SignedPaiseSchema,
  method: MethodSchema.nullable(),
  saleId: UuidSchema.nullable(),
  invoiceNumber: z.string().nullable(),
  note: z.string().nullable(),
  businessDate: z.string(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
});
export type CustomerLedgerEntryDto = z.infer<typeof CustomerLedgerEntrySchema>;

export const CustomerLedgerSchema = z.object({
  customer: CustomerSchema,
  /** Newest first. */
  entries: z.array(CustomerLedgerEntrySchema),
});
export type CustomerLedgerDto = z.infer<typeof CustomerLedgerSchema>;

export const RepaymentInputSchema = z.object({
  clientOperationId: UuidSchema,
  shopId: UuidSchema,
  customerId: UuidSchema,
  deviceId: UuidSchema.optional(),
  amountPaise: z.number().int().min(1, 'AMOUNT_REQUIRED').max(100_000_000),
  method: MethodSchema,
  note: z.string().trim().max(200).optional(),
});
export type RepaymentInput = z.infer<typeof RepaymentInputSchema>;

export const BalanceAdjustmentInputSchema = z.object({
  clientOperationId: UuidSchema,
  shopId: UuidSchema,
  customerId: UuidSchema,
  /** + adds to what is owed, − reduces it. */
  amountPaise: SignedPaiseSchema.refine((v) => v !== 0, 'AMOUNT_REQUIRED'),
  reason: z.string().trim().min(3, 'REASON_TOO_SHORT').max(200, 'REASON_TOO_LONG'),
});
export type BalanceAdjustmentInput = z.infer<typeof BalanceAdjustmentInputSchema>;

export const CustomerBalanceOutputSchema = z.object({
  customerId: UuidSchema,
  balancePaise: SignedPaiseSchema,
  replayed: z.boolean(),
});
export type CustomerBalanceOutputDto = z.infer<typeof CustomerBalanceOutputSchema>;

export const CustomerDriftSchema = z.array(
  z.object({
    customerId: UuidSchema,
    name: z.string(),
    balancePaise: SignedPaiseSchema,
    ledgerPaise: SignedPaiseSchema,
  }),
);
