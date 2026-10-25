import { translateError } from '@/core/errors/translateError';
import { InvoiceSequenceConflict, type SaleCommand } from '../../domain/entities/Bill';
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

  createSale = async (command: SaleCommand) => {
    try {
      return await this.remote.createSale(command);
    } catch (e) {
      const error = translateError(e);
      const expected = error.details?.expectedSeq;
      if (error.code === 'DS_INVOICE_SEQUENCE_CONFLICT' && typeof expected === 'number') {
        throw new InvoiceSequenceConflict(expected);
      }
      throw error;
    }
  };
  getSale = (shopId: string, saleId: string) => translated(() => this.remote.getSale(shopId, saleId));
}
