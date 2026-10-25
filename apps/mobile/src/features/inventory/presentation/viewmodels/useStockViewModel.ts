import { formatQuantity, quantityMilli } from '@ds/domain-core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type { StockDrift } from '../../domain/entities/Inventory';
import type { CheckStockDrift, ListStock } from '../../domain/usecases/inventoryUseCases';

export interface StockViewModelDeps {
  listStock: ListStock;
  checkDrift: CheckStockDrift;
}

export const inventoryKeys = {
  all: (shopId: string) => ['inventory', shopId] as const,
  list: (shopId: string, lowOnly: boolean, query: string) =>
    ['inventory', shopId, 'list', lowOnly, query] as const,
  movements: (shopId: string, productId: string) => ['inventory', shopId, 'movements', productId] as const,
};

/** "2.5" for a quantity in milli-units. */
export const qty = (milli: number) => formatQuantity(quantityMilli(milli));

/** Stock list: search, low-stock filter, and the owner's "check stock records" (drift) action. */
export function useStockViewModel(deps: StockViewModelDeps, shopId: string) {
  const [lowOnly, setLowOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [drift, setDrift] = useState<StockDrift[] | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const list = useQuery({
    queryKey: inventoryKeys.list(shopId, lowOnly, debounced),
    queryFn: () => deps.listStock.execute(shopId, lowOnly, debounced),
  });

  const checkDrift = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setErrorKey(null);
    try {
      setDrift(await deps.checkDrift.execute(shopId));
    } catch (error) {
      setErrorKey(translateError(error).messageKey);
    } finally {
      busy.current = false;
    }
  }, [deps, shopId]);

  return {
    state: {
      lowOnly,
      query,
      items: list.data ?? [],
      loading: list.isPending,
      loadErrorKey: list.isError ? translateError(list.error).messageKey : null,
      drift,
      errorKey,
    },
    actions: {
      toggleLowOnly: () => setLowOnly((v) => !v),
      setQuery,
      reload: () => void list.refetch(),
      checkDrift,
    },
  };
}
