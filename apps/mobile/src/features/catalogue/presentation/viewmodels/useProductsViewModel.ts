import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type { LoadCatalogueReference, SearchProducts } from '../../domain/usecases/catalogueUseCases';
import { catalogueKeys } from '../catalogueKeys';

export interface ProductsViewModelDeps {
  searchProducts: SearchProducts;
  loadReference: LoadCatalogueReference;
}

export const PAGE_SIZE = 30;
export const SEARCH_DEBOUNCE_MS = 300;

/** Product list with debounced search, category filter and paging. */
export function useProductsViewModel(
  { searchProducts, loadReference }: ProductsViewModelDeps,
  shopId: string,
) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const reference = useQuery({
    queryKey: catalogueKeys.reference(shopId),
    queryFn: () => loadReference.execute(shopId),
  });

  const products = useInfiniteQuery({
    queryKey: catalogueKeys.search(shopId, debounced, categoryId),
    queryFn: ({ pageParam }) =>
      searchProducts.execute(shopId, { query: debounced, categoryId, offset: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });

  const unitLabels = useMemo(
    () => Object.fromEntries((reference.data?.units ?? []).map((u) => [u.code, u.label])),
    [reference.data],
  );
  const items = useMemo(() => products.data?.pages.flatMap((p) => p.items) ?? [], [products.data]);

  return {
    state: {
      query,
      categoryId,
      categories: reference.data?.categories ?? [],
      unitLabels,
      items,
      status: products.isPending ? 'loading' : products.isError ? 'error' : 'loaded',
      errorKey: products.isError ? translateError(products.error).messageKey : null,
      loadingMore: products.isFetchingNextPage,
      hasMore: products.hasNextPage,
      searching: query.trim() !== debounced,
    } as const,
    actions: {
      setQuery,
      setCategoryId: (id: string | null) => setCategoryId((current) => (current === id ? null : id)),
      loadMore: () => {
        if (products.hasNextPage && !products.isFetchingNextPage) void products.fetchNextPage();
      },
      retry: () => void products.refetch(),
    },
  };
}
