import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type { CountResult } from '../../domain/entities/Inventory';
import {
  type ListStock,
  StockInputError,
  type SubmitStockCount,
} from '../../domain/usecases/inventoryUseCases';
import { inventoryKeys } from './useStockViewModel';

export interface StockCountViewModelDeps {
  listStock: ListStock;
  submitCount: SubmitStockCount;
  newId: () => string;
}

/** Count the shelf: type what is there for any items, submit once, see the differences that were applied. */
export function useStockCountViewModel(deps: StockCountViewModelDeps, shopId: string) {
  const queryClient = useQueryClient();
  const items = useQuery({
    queryKey: inventoryKeys.list(shopId, false, ''),
    queryFn: () => deps.listStock.execute(shopId),
  });
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CountResult | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = useRef(false);
  const op = useRef<{ values: string; id: string } | null>(null);

  const submit = useCallback(async () => {
    if (busy.current || !items.data) return;
    busy.current = true;
    setSaving(true);
    setErrorKey(null);
    const values = JSON.stringify([counted, note.trim()]);
    if (op.current?.values !== values) op.current = { values, id: deps.newId() };
    try {
      setResult(
        await deps.submitCount.execute({
          clientOperationId: op.current.id,
          shopId,
          items: items.data,
          counted,
          note,
        }),
      );
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
  }, [counted, deps, items.data, note, queryClient, shopId]);

  return {
    state: {
      items: items.data ?? [],
      loading: items.isPending,
      loadErrorKey: items.isError ? translateError(items.error).messageKey : null,
      counted,
      note,
      saving,
      result,
      errorKey,
    },
    actions: {
      setCounted: (productId: string, text: string) => setCounted((c) => ({ ...c, [productId]: text })),
      setNote,
      submit,
      reload: () => void items.refetch(),
    },
  };
}
