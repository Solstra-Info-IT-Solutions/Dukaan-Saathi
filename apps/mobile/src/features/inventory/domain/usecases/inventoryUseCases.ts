import { parseQuantity } from '@ds/domain-core';
import type {
  CountResult,
  StockAdjustReason,
  StockDrift,
  StockItem,
  StockMovement,
} from '../entities/Inventory';
import type { InventoryRepository } from '../repositories/InventoryRepository';

export class StockInputError extends Error {
  constructor(readonly reason: 'INVALID_QUANTITY' | 'WHOLE_UNITS' | 'NOTHING_COUNTED') {
    super(reason);
    this.name = 'StockInputError';
  }
}

/** Quantity typed for an item ("2.5", "12") → milli-units, respecting whole-unit items. */
export function quantityInput(text: string, allowsFraction: boolean): number {
  const q = parseQuantity(text);
  if (q === null) throw new StockInputError('INVALID_QUANTITY');
  if (!allowsFraction && q % 1000 !== 0) throw new StockInputError('WHOLE_UNITS');
  return q;
}

export class ListStock {
  constructor(private readonly inventory: InventoryRepository) {}
  execute(shopId: string, lowOnly = false, query = ''): Promise<StockItem[]> {
    return this.inventory.listStock(shopId, lowOnly, query.trim());
  }
}

export class GetStockMovements {
  constructor(private readonly inventory: InventoryRepository) {}
  execute(shopId: string, productId: string, limit = 50): Promise<StockMovement[]> {
    return this.inventory.movements(shopId, productId, limit);
  }
}

/** Adds or removes stock with a reason; "opening" is the first stock of an item. */
export class AdjustStock {
  constructor(private readonly inventory: InventoryRepository) {}
  async execute(input: {
    clientOperationId: string;
    shopId: string;
    item: Pick<StockItem, 'productId' | 'allowsFraction'>;
    direction: 'add' | 'remove';
    quantityText: string;
    reason: StockAdjustReason;
    note: string;
  }): Promise<{ stockOnHandMilli: number }> {
    const q = quantityInput(input.quantityText, input.item.allowsFraction);
    if (q === 0) throw new StockInputError('INVALID_QUANTITY');
    return this.inventory.adjust({
      clientOperationId: input.clientOperationId,
      shopId: input.shopId,
      productId: input.item.productId,
      deltaMilli: input.direction === 'add' ? q : -q,
      reason: input.reason,
      ...(input.note.trim() ? { note: input.note.trim() } : {}),
    });
  }
}

/** Sends the counted quantities (only items the user filled in); the server adjusts by counted − on hand. */
export class SubmitStockCount {
  constructor(private readonly inventory: InventoryRepository) {}
  async execute(input: {
    clientOperationId: string;
    shopId: string;
    items: readonly Pick<StockItem, 'productId' | 'allowsFraction'>[];
    counted: Readonly<Record<string, string>>;
    note: string;
  }): Promise<CountResult> {
    const counts = input.items
      .filter((i) => (input.counted[i.productId] ?? '').trim() !== '')
      .map((i) => ({
        productId: i.productId,
        countedMilli: quantityInput(input.counted[i.productId]!, i.allowsFraction),
      }));
    if (counts.length === 0) throw new StockInputError('NOTHING_COUNTED');
    return this.inventory.submitCount({
      clientOperationId: input.clientOperationId,
      shopId: input.shopId,
      counts,
      ...(input.note.trim() ? { note: input.note.trim() } : {}),
    });
  }
}

export class CheckStockDrift {
  constructor(private readonly inventory: InventoryRepository) {}
  execute(shopId: string): Promise<StockDrift[]> {
    return this.inventory.checkDrift(shopId);
  }
}
