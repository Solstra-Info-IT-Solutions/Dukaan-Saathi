import type { CreatedSale, Sale, SaleCommand } from '../entities/Bill';

export interface BillingRepository {
  /** Safe to repeat with the same command: the server replays the stored result. */
  createSale(command: SaleCommand): Promise<CreatedSale>;
  getSale(shopId: string, saleId: string): Promise<Sale>;
}
