import type {
  PurchaseCommand,
  PurchaseResult,
  SaveSupplierCommand,
  Supplier,
  SupplierLedgerEntry,
  SupplierPaymentCommand,
} from '../entities/Purchases';

export interface PurchaseRepository {
  listSuppliers(shopId: string): Promise<Supplier[]>;
  /** Creates (client id) or edits a supplier; safe to repeat. */
  saveSupplier(command: SaveSupplierCommand): Promise<Supplier>;
  /** Newest first. */
  ledger(shopId: string, supplierId: string): Promise<SupplierLedgerEntry[]>;
  /** Safe to repeat with the same command. */
  receivePurchase(command: PurchaseCommand): Promise<PurchaseResult>;
  /** Safe to repeat with the same command. */
  paySupplier(command: SupplierPaymentCommand): Promise<{ balancePaise: number }>;
}
