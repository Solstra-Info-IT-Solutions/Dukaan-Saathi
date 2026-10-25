import { parseRupeesToPaise } from '@ds/domain-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import {
  type CloseDay,
  DayCloseInputError,
  expectedCash,
  type GetDayClose,
} from '../../domain/usecases/reportsUseCases';

export { money } from '../../domain/usecases/reportsUseCases';

export interface DayCloseViewModelDeps {
  getDayClose: GetDayClose;
  closeDay: CloseDay;
  newId: () => string;
}

const dayCloseKey = (shopId: string, deviceId: string) => ['reports', shopId, 'dayClose', deviceId] as const;

/** Count the drawer at the end of the day: expected cash from the server, counted cash typed in, difference stored. */
export function useDayCloseViewModel(deps: DayCloseViewModelDeps, shopId: string, deviceId: string) {
  const queryClient = useQueryClient();
  const day = useQuery({
    queryKey: dayCloseKey(shopId, deviceId),
    queryFn: () => deps.getDayClose.execute(shopId, deviceId),
  });
  const [openingText, setOpeningText] = useState('');
  const [countedText, setCountedText] = useState('');
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = useRef(false);
  /** One operation id per set of typed values, so a retry cannot store a second closing. */
  const op = useRef<{ values: string; id: string } | null>(null);

  const opening = openingText.trim() ? parseRupeesToPaise(openingText) : 0;
  const counted = countedText.trim() ? parseRupeesToPaise(countedText) : null;
  const breakdown = day.data?.breakdown;
  const expected = breakdown && opening !== null ? expectedCash(breakdown, opening) : null;
  const difference = expected !== null && counted !== null ? counted - expected : null;

  const close = useCallback(async () => {
    if (busy.current || !day.data) return;
    busy.current = true;
    setClosing(true);
    setErrorKey(null);
    const values = `${opening}|${counted}|${note.trim()}|${day.data.businessDate}`;
    if (op.current?.values !== values) op.current = { values, id: deps.newId() };
    try {
      const closed = await deps.closeDay.execute({
        clientOperationId: op.current.id,
        shopId,
        deviceId,
        businessDate: day.data.businessDate,
        openingCashPaise: opening,
        countedCashPaise: counted,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      queryClient.setQueryData(dayCloseKey(shopId, deviceId), closed);
    } catch (error) {
      setErrorKey(
        error instanceof DayCloseInputError
          ? `dayClose.errors.${error.reason}`
          : translateError(error).messageKey,
      );
    } finally {
      busy.current = false;
      setClosing(false);
    }
  }, [counted, day.data, deps, deviceId, note, opening, queryClient, shopId]);

  return {
    state: {
      loading: day.isPending,
      loadErrorKey: day.isError ? translateError(day.error).messageKey : null,
      day: day.data ?? null,
      openingText,
      countedText,
      note,
      expected,
      difference,
      closing,
      errorKey,
    },
    actions: { setOpeningText, setCountedText, setNote, close, reload: () => void day.refetch() },
  };
}
