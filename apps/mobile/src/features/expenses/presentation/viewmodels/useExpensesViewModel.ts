import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import {
  activeTotal,
  ExpenseInputError,
  type GetExpensePhotoUrl,
  type ListExpenses,
  type VoidExpense,
} from '../../domain/usecases/expenseUseCases';

export interface ExpensesViewModelDeps {
  listExpenses: ListExpenses;
  voidExpense: VoidExpense;
  photoUrl: GetExpensePhotoUrl;
  openUrl: (url: string) => Promise<void>;
  now?: () => Date;
}

export type ExpenseRange = 'today' | 'week' | 'month';
export const expenseKeys = {
  all: (shopId: string) => ['expenses', shopId] as const,
  list: (shopId: string, from: string, to: string) => ['expenses', shopId, from, to] as const,
};

const DAY_MS = 86_400_000;
const istDate = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/** Expenses of today / 7 days / this month with their total; owners void with a reason; photos open via a short-lived link. */
export function useExpensesViewModel(deps: ExpensesViewModelDeps, shopId: string) {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<ExpenseRange>('today');
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = useRef(false);

  const { from, to } = useMemo(() => {
    const now = deps.now?.() ?? new Date();
    const today = istDate(now);
    if (range === 'today') return { from: today, to: today };
    if (range === 'week') return { from: istDate(new Date(now.getTime() - 6 * DAY_MS)), to: today };
    return { from: `${today.slice(0, 8)}01`, to: today };
  }, [deps, range]);

  const list = useQuery({
    queryKey: expenseKeys.list(shopId, from, to),
    queryFn: () => deps.listExpenses.execute(shopId, from, to),
  });

  const confirmVoid = useCallback(async () => {
    if (busy.current || !voidingId) return;
    busy.current = true;
    setErrorKey(null);
    try {
      await deps.voidExpense.execute(shopId, voidingId, reason);
      setVoidingId(null);
      setReason('');
      await queryClient.invalidateQueries({ queryKey: expenseKeys.all(shopId) });
    } catch (error) {
      setErrorKey(
        error instanceof ExpenseInputError
          ? `expenses.errors.${error.reason}`
          : translateError(error).messageKey,
      );
    } finally {
      busy.current = false;
    }
  }, [deps, queryClient, reason, shopId, voidingId]);

  const openPhoto = useCallback(
    async (path: string) => {
      setErrorKey(null);
      try {
        await deps.openUrl(await deps.photoUrl.execute(path));
      } catch (error) {
        setErrorKey(translateError(error).messageKey);
      }
    },
    [deps],
  );

  const items = list.data ?? [];
  return {
    state: {
      range,
      items,
      total: activeTotal(items),
      loading: list.isPending,
      loadErrorKey: list.isError ? translateError(list.error).messageKey : null,
      voidingId,
      reason,
      errorKey,
    },
    actions: {
      setRange,
      reload: () => void list.refetch(),
      startVoid: (id: string) => {
        setErrorKey(null);
        setReason('');
        setVoidingId(id);
      },
      cancelVoid: () => setVoidingId(null),
      setReason,
      confirmVoid,
      openPhoto,
    },
  };
}
