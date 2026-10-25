import type { CreatedSale, Sale, SaleCommand, SaleFilter, SaleListItem, VoidCommand } from '../entities/Bill';

export interface SalePage {
  items: SaleListItem[];
  nextCursor: string | null;
}

export interface BillingRepository {
  /** Safe to repeat with the same command: the server replays the stored result. */
  createSale(command: SaleCommand): Promise<CreatedSale>;
  getSale(shopId: string, saleId: string): Promise<Sale>;
  /** Newest first; `cursor` comes from the previous page. */
  listSales(shopId: string, filter: SaleFilter, cursor: string | null, limit: number): Promise<SalePage>;
  /** Safe to repeat with the same command. */
  voidSale(command: VoidCommand): Promise<Sale>;
}
