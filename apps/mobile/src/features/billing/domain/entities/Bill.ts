import type {
  BillTotalsDto,
  CatalogueReferenceDto,
  CreateSaleInput,
  CreateSaleOutputDto,
  ProductDto,
  SaleDto,
  SaleListItemDto,
  SalePaymentMethod,
  SaleReturnInput,
  SaleReturnOutputDto,
  ShopRole,
  VoidSaleInput,
} from '@ds/contracts';

// Contract shapes are already what the domain needs (validated by Zod in the data layer).
export type Sale = SaleDto;
export type BillTotals = BillTotalsDto;
export type PaymentMethod = SalePaymentMethod;
export type CreatedSale = CreateSaleOutputDto;
export type SaleCommand = CreateSaleInput;
export type VoidCommand = VoidSaleInput;
export type ReturnCommand = SaleReturnInput;
export type SaleReturnResult = SaleReturnOutputDto;
export type SaleListItem = SaleListItemDto;
export type CatalogueProduct = ProductDto;
export type CatalogueReference = CatalogueReferenceDto;

/** One amount typed on the keypad ("₹40 doodh"). `key` is local, for list rendering and editing. */
export interface QuickLine {
  kind: 'quick';
  key: string;
  label: string;
  amountPaise: number;
}

/** A catalogue item: quantity in milli-units, price per unit, optional override and line discount. */
export interface ProductLine {
  kind: 'product';
  key: string;
  productId: string;
  name: string;
  unitCode: string;
  allowsFraction: boolean;
  /** Catalogue price when the line was added; a different unitPricePaise is an override. */
  listPricePaise: number;
  unitPricePaise: number;
  quantityMilli: number;
  taxRateBp: number;
  lineDiscountPaise: number;
  entryMode: 'quantity' | 'amount';
}

export type BillLine = QuickLine | ProductLine;

export interface BillDraft {
  lines: BillLine[];
  billDiscountPaise: number;
}

export const emptyDraft: BillDraft = { lines: [], billDiscountPaise: 0 };

export interface PaymentPart {
  method: PaymentMethod;
  amountPaise: number;
}

/** Shop settings that change how a bill is computed and paid. */
export interface BillingSettings {
  timezone: string;
  taxMode: 'none' | 'gst_regular' | 'gst_composition';
  roundOffEnabled: boolean;
  enabledPaymentMethods: readonly string[];
  upiVpa: string | null;
  cashierDiscountLimitBp: number;
  managerDiscountLimitBp: number;
  priceOverrideAllowed: boolean;
}

/** The active shop and this phone's invoice series (from register_device). */
export interface BillingContext {
  shopId: string;
  shopName: string;
  role: ShopRole;
  canDiscount: boolean;
  canOverridePrice: boolean;
  canManageProducts: boolean;
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

/** Catalogue access billing needs; the composition root adapts the catalogue feature to it. */
export interface ProductFinder {
  search(shopId: string, text: string): Promise<CatalogueProduct[]>;
  /** Exact barcode match among active products, or null. */
  byBarcode(shopId: string, code: string): Promise<CatalogueProduct | null>;
  reference(shopId: string): Promise<CatalogueReference>;
}

export interface SaleFilter {
  from: string | null;
  to: string | null;
  status: 'voided' | null;
  query: string;
}

/** The server expects another invoice number from this phone (create_sale DS_INVOICE_SEQUENCE_CONFLICT). */
export class InvoiceSequenceConflict extends Error {
  constructor(readonly expectedSeq: number) {
    super('DS_INVOICE_SEQUENCE_CONFLICT');
    this.name = 'InvoiceSequenceConflict';
  }
}

/** A product's price changed since it was added to the bill (create_sale DS_TOTAL_MISMATCH, price_changed). */
export class PriceChanged extends Error {
  constructor(
    readonly productId: string,
    readonly currentPricePaise: number,
  ) {
    super('PRICE_CHANGED');
    this.name = 'PriceChanged';
  }
}
