import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type { StockAdjustReason } from '../../domain/entities/Inventory';
import {
  type AdjustStock,
  type GetStockMovements,
  type ListStock,
  StockInputError,
} from '../../domain/usecases/inventoryUseCases';
import { inventoryKeys } from './useStockViewModel';

export interface StockItemViewModelDeps {
  listStock: ListStock;
  getMovements: GetStockMovements;
  adjustStock: AdjustStock;
  newId: () => string;
}

/** One item: movement history that explains its stock, and an adjustment form (add / remove with a reason). */
export function useStockItemViewModel(deps: StockItemViewModelDeps, shopId: string, productId: string) {
  const queryClient = useQueryClient();
  const items = useQuery({
    queryKey: inventoryKeys.list(shopId, false, ''),
    queryFn: () => deps.listStock.execute(shopId),
  });
  const item = items.data?.find((i) => i.productId === productId) ?? null;
  const movements = useQuery({
    queryKey: inventoryKeys.movements(shopId, productId),
    queryFn: () => deps.getMovements.execute(shopId, productId),
  });
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [quantityText, setQuantityText] = useState('');
  const [chosenReason, setReason] = useState<StockAdjustReason | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = useRef(false);
  /** One operation id per typed adjustment, so a retry is not applied twice. */
  const op = useRef<{ values: string; id: string } | null>(null);

  // An item with no movements yet starts with its opening stock.
  const reason: StockAdjustReason =
    chosenReason ?? (movements.data && movements.data.length === 0 ? 'opening' : 'damage');

  const save = useCallback(async () => {
    if (busy.current || !item) return;
    busy.current = true;
    setSaving(true);
    setErrorKey(null);
    const values = `${direction}|${quantityText}|${reason}|${note.trim()}`;
    if (op.current?.values !== values) op.current = { values, id: deps.newId() };
    try {
      await deps.adjustStock.execute({
        clientOperationId: op.current.id,
        shopId,
        item,
        direction,
        quantityText,
        reason,
        note,
      });
      setQuantityText('');
      setNote('');
      op.current = null;
      await queryClient.invalidateQueries({ queryKey: inventoryKeys.all(shopId) });
    } catch (error) {
      setErrorKey(
        error instanceof StockInputError
          ? `inventory.errors.${error.reason}`
          : translateError(error).messageKey,
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [deps, direction, item, note, queryClient, quantityText, reason, shopId]);

  return {
    state: {
      loading: items.isPending,
      loadErrorKey: items.isError ? translateError(items.error).messageKey : null,
      item,
      movements: movements.data ?? [],
      movementsLoading: movements.isPending,
      direction,
      quantityText,
      reason,
      note,
      saving,
      errorKey,
    },
    actions: {
      setDirection,
      setQuantityText,
      setReason,
      setNote,
      save,
      reload: () => void items.refetch(),
    },
  };
}
