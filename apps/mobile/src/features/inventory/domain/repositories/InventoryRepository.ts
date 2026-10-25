import type {
  AdjustCommand,
  CountCommand,
  CountResult,
  StockDrift,
  StockItem,
  StockMovement,
} from '../entities/Inventory';

export interface InventoryRepository {
  /** Products that track stock; low first. */
  listStock(shopId: string, lowOnly: boolean, query: string): Promise<StockItem[]>;
  /** Newest first. */
  movements(shopId: string, productId: string, limit: number): Promise<StockMovement[]>;
  /** Safe to repeat with the same command. */
  adjust(command: AdjustCommand): Promise<{ stockOnHandMilli: number }>;
  /** Safe to repeat with the same command. */
  submitCount(command: CountCommand): Promise<CountResult>;
  /** Products whose on-hand differs from the sum of their movements (should be none). */
  checkDrift(shopId: string): Promise<StockDrift[]>;
}
