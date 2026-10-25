import { z } from 'zod';
import { PaiseSchema, SignedPaiseSchema, UuidSchema } from './common';

/** Phase 06 contracts: dashboard, sales report, day close, expenses, returns (features/reports-expenses-dayclose.md). */

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MethodSchema = z.enum(['cash', 'upi', 'card', 'other']);

export const ProfitEstimateSchema = z.object({
  profitPaise: SignedPaiseSchema,
  linesWithCost: z.number().int(),
  lines: z.number().int(),
});

/** Cashiers get `scope: "own"` (their own bills of the day only). */
export const DashboardSnapshotSchema = z.discriminatedUnion('scope', [
  z.object({
    scope: z.literal('own'),
    businessDate: DateSchema,
    salesPaise: PaiseSchema,
    bills: z.number().int(),
  }),
  z.object({
    scope: z.literal('shop'),
    businessDate: DateSchema,
    salesPaise: PaiseSchema,
    bills: z.number().int(),
    voidedBills: z.number().int(),
    discountPaise: PaiseSchema,
    taxPaise: PaiseSchema,
    udhaarGivenPaise: PaiseSchema,
    returnsPaise: PaiseSchema,
    netSalesPaise: SignedPaiseSchema,
    expensesPaise: PaiseSchema,
    /** Only methods used that day appear (partial record). */
    payments: z.partialRecord(MethodSchema, PaiseSchema),
    refunds: z.partialRecord(MethodSchema, PaiseSchema),
    profit: ProfitEstimateSchema.optional(),
  }),
]);
export type DashboardSnapshotDto = z.infer<typeof DashboardSnapshotSchema>;

export const REPORT_GROUPS = ['day', 'payment', 'product', 'category', 'staff'] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];
/** Groups and ranges that need the reports.advanced entitlement (server-enforced). */
export const ADVANCED_REPORT_GROUPS: readonly ReportGroup[] = ['product', 'category', 'staff'];
export const BASIC_REPORT_MAX_DAYS = 7;

export const SalesReportRowSchema = z.object({
  key: z.string().nullable(),
  label: z.string(),
  salesPaise: z.number().int(),
  bills: z.number().int().optional(),
  quantityMilli: z.number().int().nullable().optional(),
  returnsPaise: z.number().int().optional(),
  netPaise: z.number().int().optional(),
  profitPaise: z.number().int().optional(),
});

export const SalesReportSchema = z.object({
  from: DateSchema,
  to: DateSchema,
  groupBy: z.enum(REPORT_GROUPS),
  rows: z.array(SalesReportRowSchema),
  totals: z.object({
    salesPaise: PaiseSchema,
    bills: z.number().int(),
    returnsPaise: PaiseSchema,
    expensesPaise: PaiseSchema,
    profit: ProfitEstimateSchema.optional(),
  }),
});
export type SalesReportDto = z.infer<typeof SalesReportSchema>;

export const ExportStartedSchema = z.object({ used: z.number().int(), limit: z.number().int().nullable() });

export const CashBreakdownSchema = z.object({
  openingCashPaise: PaiseSchema,
  cashSalesPaise: PaiseSchema,
  cashRefundsPaise: PaiseSchema,
  cashExpensesPaise: PaiseSchema,
  /** Phase 07; closings stored before it have no such key. */
  cashSupplierPaymentsPaise: PaiseSchema.default(0),
  expectedCashPaise: SignedPaiseSchema,
});
export const DayCloseSchema = z.object({
  businessDate: DateSchema,
  closed: z.boolean(),
  breakdown: CashBreakdownSchema,
  countedCashPaise: PaiseSchema.nullable(),
  differencePaise: SignedPaiseSchema.nullable(),
  closedAt: z.string().nullable(),
  note: z.string().nullable(),
  replayed: z.boolean().optional(),
});
export type DayCloseDto = z.infer<typeof DayCloseSchema>;

export const CloseDayInputSchema = z.object({
  clientOperationId: UuidSchema,
  shopId: UuidSchema,
  deviceId: UuidSchema,
  businessDate: DateSchema.optional(),
  openingCashPaise: PaiseSchema,
  countedCashPaise: PaiseSchema,
  note: z.string().trim().max(200).optional(),
});
export type CloseDayInput = z.infer<typeof CloseDayInputSchema>;

export const EXPENSE_CATEGORIES = [
  'rent',
  'salary',
  'electricity',
  'transport',
  'supplies',
  'tea_snacks',
  'repairs',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const ExpenseSchema = z.object({
  id: UuidSchema,
  businessDate: DateSchema,
  category: z.enum(EXPENSE_CATEGORIES),
  amountPaise: PaiseSchema,
  method: MethodSchema,
  note: z.string().nullable(),
  attachmentPath: z.string().nullable(),
  createdAt: z.string(),
  voidedAt: z.string().nullable(),
  voidReason: z.string().nullable(),
  replayed: z.boolean().optional(),
});
export type ExpenseDto = z.infer<typeof ExpenseSchema>;

export const RecordExpenseInputSchema = z.object({
  id: UuidSchema,
  shopId: UuidSchema,
  deviceId: UuidSchema.optional(),
  businessDate: DateSchema.optional(),
  category: z.enum(EXPENSE_CATEGORIES),
  amountPaise: z.number().int().min(1, 'AMOUNT_REQUIRED').max(100_000_000, 'AMOUNT_TOO_HIGH'),
  method: MethodSchema,
  note: z.string().trim().max(200).optional(),
  attachmentPath: z.string().optional(),
});
export type RecordExpenseInput = z.infer<typeof RecordExpenseInputSchema>;

export const SaleReturnInputSchema = z.object({
  clientOperationId: UuidSchema,
  shopId: UuidSchema,
  deviceId: UuidSchema,
  saleId: UuidSchema,
  lines: z
    .array(z.object({ lineNo: z.number().int().min(1), quantityMilli: z.number().int().min(1) }))
    .min(1),
  refundMethod: MethodSchema,
  reason: z.string().trim().min(3).max(200),
});
export type SaleReturnInput = z.infer<typeof SaleReturnInputSchema>;

export const SaleReturnOutputSchema = z.object({
  returnId: UuidSchema,
  saleId: UuidSchema,
  refundPaise: PaiseSchema,
  refundMethod: MethodSchema,
  replayed: z.boolean(),
});
export type SaleReturnOutputDto = z.infer<typeof SaleReturnOutputSchema>;

/** One return as shown on the receipt (part of get_sale). */
export const SaleReturnSummarySchema = z.object({
  returnId: UuidSchema,
  createdAt: z.string(),
  refundPaise: PaiseSchema,
  refundMethod: MethodSchema,
  reason: z.string(),
  lines: z.array(
    z.object({ lineNo: z.number().int(), quantityMilli: z.number().int(), refundPaise: PaiseSchema }),
  ),
});
