import { translateError } from '@/core/errors/translateError';
import type {
  PurchaseCommand,
  SaveSupplierCommand,
  SupplierPaymentCommand,
} from '../../domain/entities/Purchases';
import type { PurchaseRepository } from '../../domain/repositories/PurchaseRepository';
import type { SupabasePurchaseDataSource } from '../datasources/remote/SupabasePurchaseDataSource';

async function translated<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw translateError(e);
  }
}

export class PurchaseRepositoryImpl implements PurchaseRepository {
  constructor(private readonly remote: SupabasePurchaseDataSource) {}

  listSuppliers = (shopId: string) => translated(() => this.remote.listSuppliers(shopId));
  saveSupplier = (command: SaveSupplierCommand) => translated(() => this.remote.saveSupplier(command));
  ledger = (shopId: string, supplierId: string) => translated(() => this.remote.ledger(shopId, supplierId));
  receivePurchase = (command: PurchaseCommand) => translated(() => this.remote.receivePurchase(command));
  paySupplier = (command: SupplierPaymentCommand) => translated(() => this.remote.paySupplier(command));
}
