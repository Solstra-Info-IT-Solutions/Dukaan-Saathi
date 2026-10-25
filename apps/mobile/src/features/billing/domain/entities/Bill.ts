import type {
  BillTotalsDto,
  CreateSaleInput,
  CreateSaleOutputDto,
  SaleDto,
  SalePaymentMethod,
  ShopRole,
} from '@ds/contracts';

// Contract shapes are already what the domain needs (validated by Zod in the data layer).
export type Sale = SaleDto;
export type BillTotals = BillTotalsDto;
export type PaymentMethod = SalePaymentMethod;
export type CreatedSale = CreateSaleOutputDto;
export type SaleCommand = CreateSaleInput;

/** One amount typed on the keypad ("₹40 doodh"). `key` is local, for list rendering and removal. */
export interface QuickLine {
  key: string;
  label: string;
  amountPaise: number;
}

export interface BillDraft {
  lines: QuickLine[];
  billDiscountPaise: number;
}

export const emptyDraft: BillDraft = { lines: [], billDiscountPaise: 0 };

/** Shop settings that change how a bill is computed and paid. */
export interface BillingSettings {
  timezone: string;
  taxMode: 'none' | 'gst_regular' | 'gst_composition';
  roundOffEnabled: boolean;
  enabledPaymentMethods: readonly string[];
  upiVpa: string | null;
  cashierDiscountLimitBp: number;
  managerDiscountLimitBp: number;
}

/** The active shop and this phone's invoice series (from register_device). */
export interface BillingContext {
  shopId: string;
  shopName: string;
  role: ShopRole;
  canDiscount: boolean;
  deviceId: string;
  fy: string;
  lastSeq: number;
}

/**
 * One submission of a bill. Kept unchanged while the user retries, so the payload — and therefore
 * the idempotency key — stays the same (API_AND_RPC_CONTRACTS.md §5.1 "Retry").
 */
export interface SaleAttempt {
  clientOperationId: string;
  occurredAt: string;
}

/** Where this phone's last used invoice number is remembered between bills and app restarts. */
export interface InvoiceCounterStore {
  last(seriesKey: string): Promise<number | null>;
  save(seriesKey: string, seq: number): Promise<void>;
}

/** Sends a receipt out of the app (core/sharing implements it with expo-print / expo-sharing). */
export interface ReceiptSharer {
  sharePdf(html: string, fileName: string): Promise<void>;
  shareText(text: string): Promise<void>;
}

/** The server expects another invoice number from this phone (create_sale DS_INVOICE_SEQUENCE_CONFLICT). */
export class InvoiceSequenceConflict extends Error {
  constructor(readonly expectedSeq: number) {
    super('DS_INVOICE_SEQUENCE_CONFLICT');
    this.name = 'InvoiceSequenceConflict';
  }
}
