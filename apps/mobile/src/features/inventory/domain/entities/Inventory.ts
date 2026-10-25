import type {
  AdjustStockInput,
  StockAdjustReason,
  StockCountInput,
  StockCountOutputDto,
  StockItemDto,
  StockMovementDto,
} from '@ds/contracts';

// Contract shapes are already what the domain needs (validated by Zod in the data layer).
export type StockItem = StockItemDto;
export type StockMovement = StockMovementDto;
export type AdjustCommand = AdjustStockInput;
export type CountCommand = StockCountInput;
export type CountResult = StockCountOutputDto;
export type { StockAdjustReason };

export interface StockDrift {
  productId: string;
  name: string;
  stockOnHandMilli: number;
  fromMovementsMilli: number;
}
