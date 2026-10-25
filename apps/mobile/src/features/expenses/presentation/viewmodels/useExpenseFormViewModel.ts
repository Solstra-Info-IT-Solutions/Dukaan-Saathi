import { parseRupeesToPaise } from '@ds/domain-core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type {
  ExpenseCategory,
  ExpenseMethod,
  ExpensePhoto,
  ReceiptPhotoPicker,
} from '../../domain/entities/Expense';
import { ExpenseInputError, type RecordExpense } from '../../domain/usecases/expenseUseCases';
import { expenseKeys } from './useExpensesViewModel';

export interface ExpenseFormViewModelDeps {
  recordExpense: RecordExpense;
  photos: ReceiptPhotoPicker;
  newId: () => string;
}

/** New expense: category, amount, method, note, optional receipt photo. The expense id is fixed for the form. */
export function useExpenseFormViewModel(
  deps: ExpenseFormViewModelDeps,
  shopId: string,
  deviceId: string,
  onSaved: () => void,
) {
  const queryClient = useQueryClient();
  const [id] = useState(() => deps.newId());
  const [category, setCategory] = useState<ExpenseCategory>('tea_snacks');
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<ExpenseMethod>('cash');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<ExpensePhoto | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = useRef(false);

  const pick = useCallback(
    async (source: 'camera' | 'library') => {
      try {
        const picked = source === 'camera' ? await deps.photos.fromCamera() : await deps.photos.fromLibrary();
        if (picked) setPhoto(picked);
      } catch {
        setErrorKey('expenses.errors.PHOTO_FAILED');
      }
    },
    [deps],
  );

  const save = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setErrorKey(null);
    try {
      await deps.recordExpense.execute({
        id,
        shopId,
        deviceId,
        category,
        amountPaise: parseRupeesToPaise(amountText),
        method,
        note,
        photo,
      });
      await queryClient.invalidateQueries({ queryKey: expenseKeys.all(shopId) });
      onSaved();
    } catch (error) {
      setErrorKey(
        error instanceof ExpenseInputError
          ? `expenses.errors.${error.reason}`
          : translateError(error).messageKey,
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [amountText, category, deps, deviceId, id, method, note, onSaved, photo, queryClient, shopId]);

  return {
    state: { category, amountText, method, note, photo, saving, errorKey },
    actions: {
      setCategory,
      setAmountText,
      setMethod,
      setNote,
      takePhoto: () => pick('camera'),
      choosePhoto: () => pick('library'),
      removePhoto: () => setPhoto(null),
      save,
    },
  };
}
