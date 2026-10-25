import { parseRupeesToPaise } from '@ds/domain-core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import {
  changeDue,
  discountAllowed,
  discountLimitBp,
  draftTotals,
  type KeypadKey,
  keypadToPaise,
  maxDiscount,
  pressKeypad,
  upiPaymentUri,
} from '../../domain/billMath';
import {
  type BillDraft,
  type BillingContext,
  type BillingSettings,
  InvoiceSequenceConflict,
  type PaymentMethod,
  type QuickLine,
  type SaleAttempt,
} from '../../domain/entities/Bill';
import { BillInputError, type CreateQuickSale } from '../../domain/usecases/billingUseCases';
import { billingKeys } from '../billingKeys';

export interface BillingViewModelDeps {
  getSettings: { execute(shopId: string): Promise<BillingSettings> };
  createSale: CreateQuickSale;
  newId: () => string;
  now?: () => Date;
}

export type BillingPhase = 'editing' | 'paying' | 'submitting';

const PAYABLE: readonly PaymentMethod[] = ['cash', 'upi', 'card', 'other'];

/**
 * Quick bill (features/billing.md): keypad amounts → optional discount → payment sheet → save once.
 * One `SaleAttempt` (operation id + time) is kept until the bill changes, so double taps and retries
 * send the same request and the server saves the bill exactly once.
 */
export function useBillingViewModel(
  deps: BillingViewModelDeps,
  context: BillingContext,
  onCompleted: (saleId: string) => void,
) {
  const settings = useQuery({
    queryKey: billingKeys.settings(context.shopId),
    queryFn: () => deps.getSettings.execute(context.shopId),
  });

  const [lines, setLines] = useState<QuickLine[]>([]);
  const [entry, setEntry] = useState('');
  const [label, setLabel] = useState('');
  const [discountText, setDiscountText] = useState('');
  const [phase, setPhase] = useState<BillingPhase>('editing');
  const [chosenMethod, setChosenMethod] = useState<PaymentMethod | null>(null);
  const [tenderedText, setTenderedText] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorParams, setErrorParams] = useState<Record<string, string | number>>({});
  const attempt = useRef<SaleAttempt | null>(null);
  const busy = useRef(false);

  const s = settings.data;
  const methods = useMemo(
    () => PAYABLE.filter((m) => s?.enabledPaymentMethods.includes(m)),
    [s?.enabledPaymentMethods],
  );
  const method = chosenMethod && methods.includes(chosenMethod) ? chosenMethod : (methods[0] ?? null);
  const limitBp = s ? discountLimitBp(context.role, s) : 0;
  const canDiscount = context.canDiscount && limitBp > 0;

  const discountPaise = canDiscount ? (parseRupeesToPaise(discountText) ?? 0) : 0;
  const draft = useMemo<BillDraft>(
    () => ({ lines, billDiscountPaise: discountPaise }),
    [lines, discountPaise],
  );
  const subtotal = lines.reduce((sum, l) => sum + l.amountPaise, 0);
  const discountValid = discountPaise <= subtotal && discountAllowed(discountPaise, subtotal, limitBp);
  const totals = s && discountValid ? draftTotals(draft, s) : null;
  const tenderedPaise = parseRupeesToPaise(tenderedText);
  const change = totals && tenderedPaise !== null ? changeDue(tenderedPaise, totals.totalPaise) : null;
  const upiUri =
    s?.upiVpa && totals && totals.totalPaise > 0
      ? upiPaymentUri({ vpa: s.upiVpa, payeeName: context.shopName, amountPaise: totals.totalPaise })
      : null;

  /** Any change to what would be sent makes a new bill request. */
  const changed = useCallback(() => {
    attempt.current = null;
    setErrorKey(null);
  }, []);

  const fail = useCallback((key: string, params: Record<string, string | number> = {}) => {
    setErrorKey(key);
    setErrorParams(params);
  }, []);

  const press = useCallback((key: KeypadKey) => setEntry((e) => pressKeypad(e, key)), []);

  const takeEntry = useCallback((): QuickLine | null => {
    const amountPaise = keypadToPaise(entry);
    if (amountPaise === null) return null;
    return { key: deps.newId(), label: label.trim(), amountPaise };
  }, [deps, entry, label]);

  const addLine = useCallback(() => {
    const line = takeEntry();
    if (!line) return;
    setLines((ls) => [...ls, line]);
    setEntry('');
    setLabel('');
    changed();
  }, [changed, takeEntry]);

  const removeLine = useCallback(
    (key: string) => {
      setLines((ls) => ls.filter((l) => l.key !== key));
      changed();
    },
    [changed],
  );

  const changeDiscount = useCallback(
    (text: string) => {
      setDiscountText(text);
      changed();
    },
    [changed],
  );

  /** "Pay": a pending keypad amount is added first, so amount → Pay → Confirm is three taps. */
  const openPayment = useCallback(() => {
    const pending = takeEntry();
    const all = pending ? [...lines, pending] : lines;
    if (pending) {
      setLines(all);
      setEntry('');
      setLabel('');
      changed();
    }
    if (all.length === 0) return fail('billing.errors.EMPTY_BILL');
    const sub = all.reduce((sum, l) => sum + l.amountPaise, 0);
    if (discountPaise > sub || !discountAllowed(discountPaise, sub, limitBp)) {
      return fail('billing.errors.DISCOUNT_LIMIT', { max: maxDiscount(sub, limitBp) / 100 });
    }
    setErrorKey(null);
    setTenderedText('');
    setPhase('paying');
  }, [changed, discountPaise, fail, limitBp, lines, takeEntry]);

  const closePayment = useCallback(() => setPhase('editing'), []);

  const selectMethod = useCallback(
    (m: PaymentMethod) => {
      setChosenMethod(m);
      changed();
    },
    [changed],
  );

  const reset = useCallback(() => {
    setLines([]);
    setEntry('');
    setLabel('');
    setDiscountText('');
    setTenderedText('');
    setPhase('editing');
    attempt.current = null;
  }, []);

  const submit = useCallback(async () => {
    if (busy.current || !s || !method) return;
    busy.current = true;
    attempt.current ??= {
      clientOperationId: deps.newId(),
      occurredAt: (deps.now?.() ?? new Date()).toISOString(),
    };
    setErrorKey(null);
    setPhase('submitting');
    try {
      const created = await deps.createSale.execute({
        context,
        settings: s,
        draft,
        method,
        attempt: attempt.current,
      });
      reset();
      onCompleted(created.saleId);
    } catch (error) {
      setPhase('paying');
      if (error instanceof BillInputError) fail(`billing.errors.${error.reason}`);
      else if (error instanceof InvoiceSequenceConflict) fail('errors.DS_INVOICE_SEQUENCE_CONFLICT');
      else fail(translateError(error).messageKey);
    } finally {
      busy.current = false;
    }
  }, [context, deps, draft, fail, method, onCompleted, reset, s]);

  return {
    state: {
      loading: settings.isPending,
      settingsErrorKey: settings.isError ? translateError(settings.error).messageKey : null,
      phase,
      lines,
      entry,
      entryPaise: keypadToPaise(entry),
      label,
      discountText,
      canDiscount,
      discountLimitPercent: limitBp / 100,
      totals,
      methods,
      method,
      tenderedText,
      change,
      upiUri,
      errorKey,
      errorParams,
    },
    actions: {
      press,
      setLabel,
      addLine,
      removeLine,
      changeDiscount,
      openPayment,
      closePayment,
      selectMethod,
      setTenderedText,
      submit,
      reloadSettings: () => void settings.refetch(),
    },
  };
}
