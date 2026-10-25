import { translateError } from '@/core/errors/translateError';
import {
  InvoiceSequenceConflict,
  PriceChanged,
  type ReturnCommand,
  type SaleCommand,
  type SaleFilter,
  type VoidCommand,
} from '../../domain/entities/Bill';
import type { BillingRepository } from '../../domain/repositories/BillingRepository';
import type { SupabaseBillingDataSource } from '../datasources/remote/SupabaseBillingDataSource';

async function translated<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw translateError(e);
  }
}

export class BillingRepositoryImpl implements BillingRepository {
  constructor(private readonly remote: SupabaseBillingDataSource) {}

  /** Maps the two create_sale errors the domain reacts to into domain errors. */
  createSale = async (command: SaleCommand) => {
    try {
      return await this.remote.createSale(command);
    } catch (e) {
      const error = translateError(e);
      const d = error.details ?? {};
      if (error.code === 'DS_INVOICE_SEQUENCE_CONFLICT' && typeof d.expectedSeq === 'number') {
        throw new InvoiceSequenceConflict(d.expectedSeq);
      }
      if (
        error.code === 'DS_TOTAL_MISMATCH' &&
        d.reason === 'price_changed' &&
        typeof d.productId === 'string' &&
        typeof d.currentPricePaise === 'number'
      ) {
        throw new PriceChanged(d.productId, d.currentPricePaise);
      }
      throw error;
    }
  };
  getSale = (shopId: string, saleId: string) => translated(() => this.remote.getSale(shopId, saleId));
  listSales = (shopId: string, filter: SaleFilter, cursor: string | null, limit: number) =>
    translated(() => this.remote.listSales(shopId, filter, cursor, limit));
  voidSale = (command: VoidCommand) => translated(() => this.remote.voidSale(command));
  createReturn = (command: ReturnCommand) => translated(() => this.remote.createReturn(command));
}
