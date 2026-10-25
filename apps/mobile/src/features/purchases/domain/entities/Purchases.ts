import type {
  CatalogueReferenceDto,
  ProductDto,
  ReceivePurchaseInput,
  ReceivePurchaseOutputDto,
  SaveSupplierInput,
  SupplierDto,
  SupplierLedgerEntryDto,
  SupplierPaymentInput,
} from '@ds/contracts';

// Contract shapes are already what the domain needs (validated by Zod in the data layer).
export type Supplier = SupplierDto;
export type SupplierLedgerEntry = SupplierLedgerEntryDto;
export type SaveSupplierCommand = SaveSupplierInput;
export type PurchaseCommand = ReceivePurchaseInput;
export type PurchaseResult = ReceivePurchaseOutputDto;
export type SupplierPaymentCommand = SupplierPaymentInput;
export type PaymentMethod = SupplierPaymentInput['method'];
export type CatalogueProduct = ProductDto;
export type CatalogueReference = CatalogueReferenceDto;

/** One line of a purchase being entered: quantities and prices as typed. */
export interface PurchaseLineDraft {
  key: string;
  productId: string;
  name: string;
  unitCode: string;
  allowsFraction: boolean;
  quantityText: string;
  /** Cost per unit in rupees, as typed. */
  costText: string;
  /** Optional new selling price in rupees; empty keeps the current price. */
  newPriceText: string;
  currentPricePaise: number;
}

/** Catalogue access purchases need; the composition root adapts the catalogue feature to it. */
export interface PurchaseProductFinder {
  search(shopId: string, text: string): Promise<CatalogueProduct[]>;
  reference(shopId: string): Promise<CatalogueReference>;
}
