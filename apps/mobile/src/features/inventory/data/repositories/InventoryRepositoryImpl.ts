import { translateError } from '@/core/errors/translateError';
import type { AdjustCommand, CountCommand } from '../../domain/entities/Inventory';
import type { InventoryRepository } from '../../domain/repositories/InventoryRepository';
import type { SupabaseInventoryDataSource } from '../datasources/remote/SupabaseInventoryDataSource';

async function translated<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw translateError(e);
  }
}

export class InventoryRepositoryImpl implements InventoryRepository {
  constructor(private readonly remote: SupabaseInventoryDataSource) {}

  listStock = (shopId: string, lowOnly: boolean, query: string) =>
    translated(() => this.remote.listStock(shopId, lowOnly, query));
  movements = (shopId: string, productId: string, limit: number) =>
    translated(() => this.remote.movements(shopId, productId, limit));
  adjust = (command: AdjustCommand) => translated(() => this.remote.adjust(command));
  submitCount = (command: CountCommand) => translated(() => this.remote.submitCount(command));
  checkDrift = (shopId: string) => translated(() => this.remote.checkDrift(shopId));
}
