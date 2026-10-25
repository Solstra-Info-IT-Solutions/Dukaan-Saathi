// Public API of the inventory feature (stock list, item history and adjustments, stock count).
export type { InventoryRepository } from './domain/repositories/InventoryRepository';
export type { StockItem } from './domain/entities/Inventory';
export {
  AdjustStock,
  CheckStockDrift,
  GetStockMovements,
  ListStock,
  SubmitStockCount,
} from './domain/usecases/inventoryUseCases';
export { InventoryRepositoryImpl } from './data/repositories/InventoryRepositoryImpl';
export { SupabaseInventoryDataSource } from './data/datasources/remote/SupabaseInventoryDataSource';
export { StockScreen } from './presentation/screens/StockScreen';
export { StockItemScreen } from './presentation/screens/StockItemScreen';
export { StockCountScreen } from './presentation/screens/StockCountScreen';
export type { StockViewModelDeps } from './presentation/viewmodels/useStockViewModel';
export type { StockItemViewModelDeps } from './presentation/viewmodels/useStockItemViewModel';
export type { StockCountViewModelDeps } from './presentation/viewmodels/useStockCountViewModel';
