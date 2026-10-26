import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type { SaleFilter } from '../../domain/entities/Bill';
import type { ListSales } from '../../domain/usecases/billingUseCases';
import { billingKeys } from '../billingKeys';

export interface SalesHistoryViewModelDeps {
  listSales: ListSales;
  now?: () => Date;
}

export type SalesRange = 'today' | 'week' | 'all';

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000; // India has no daylight saving

/** Start of the shop's day (IST) containing `now`, as an ISO instant. */
export function startOfIstDay(now: Date): Date {
  return new Date(Math.floor((now.getTime() + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS);
}

export const PAGE_SIZE = 30;

/**
 * Bills of the shop, newest first: today / last 7 days / all, voided only or flagged for review (offline bills,
 * Phase 09), search by bill number or item.
 */
export function useSalesHistoryViewModel(deps: SalesHistoryViewModelDeps, shopId: string) {
  const [range, setRange] = useState<SalesRange>('today');
  const [voidedOnly, setVoidedOnly] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const filter = useMemo<SaleFilter>(() => {
    const today = startOfIstDay(deps.now?.() ?? new Date());
    const from = range === 'today' ? today : range === 'week' ? new Date(today.getTime() - 6 * DAY_MS) : null;
    return {
      from: from?.toISOString() ?? null,
      to: null,
      status: voidedOnly ? 'voided' : reviewOnly ? 'needs_review' : null,
      query: debounced,
    };
  }, [debounced, deps, range, reviewOnly, voidedOnly]);

  const list = useInfiniteQuery({
    queryKey: billingKeys.sales(shopId, filter),
    queryFn: ({ pageParam }) => deps.listSales.execute(shopId, filter, pageParam, PAGE_SIZE),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  return {
    state: {
      range,
      voidedOnly,
      reviewOnly,
      query,
      items,
      loading: list.isPending,
      errorKey: list.isError ? translateError(list.error).messageKey : null,
      loadingMore: list.isFetchingNextPage,
      refreshing: list.isRefetching && !list.isFetchingNextPage,
    },
    actions: {
      setRange,
      toggleVoided: () => {
        setVoidedOnly((v) => !v);
        setReviewOnly(false);
      },
      toggleReview: () => {
        setReviewOnly((v) => !v);
        setVoidedOnly(false);
      },
      setQuery,
      loadMore: () => {
        if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
      },
      refresh: () => void list.refetch(),
    },
  };
}
