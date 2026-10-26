import { formatQuantity, parseRupeesToPaise, quantityMilli } from '@ds/domain-core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import {
  addProductLine,
  changeDue,
  discountAllowed,
  discountLimitBp,
  draftTotals,
  type KeypadKey,
  keypadToPaise,
  lineAmount,
  maxDiscount,
  pressKeypad,
  productLine,
  quantityFromAmount,
  quantityFromText,
  splitPayments,
  upiPaymentUri,
} from '../../domain/billMath';
import {
  type BillCustomer,
  type BillDraft,
  type BillingContext,
  type BillMethod,
  type BillPart,
  type BillingSettings,
  type BillLine,
  type CatalogueProduct,
  type CustomerFinder,
  InvoiceSequenceConflict,
  type PaymentMethod,
  PriceChanged,
  type ProductFinder,
  type ProductLine,
  type SaleAttempt,
} from '../../domain/entities/Bill';
import { BillInputError, type CreateSale } from '../../domain/usecases/billingUseCases';
import { billingKeys } from '../billingKeys';

export interface BillingViewModelDeps {
  getSettings: { execute(shopId: string): Promise<BillingSettings> };
  createSale: CreateSale;
  products: ProductFinder;
  /** Phase 08: needed for udhaar bills. */
  customers?: CustomerFinder;
  newId: () => string;
  now?: () => Date;
}

export type BillingPhase = 'editing' | 'paying' | 'submitting';
export type ScanState = { kind: 'closed' } | { kind: 'scanning' } | { kind: 'unknown'; code: string };

export interface LineEditor {
  key: string;
  quantityText: string;
  amountText: string;
  priceText: string;
  discountText: string;
}

const PAYABLE: readonly BillMethod[] = ['cash', 'upi', 'card', 'other', 'udhaar'];
export const SEARCH_DEBOUNCE_MS = 250;
const rupees = (p: number) => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));

/**
 * Bill (features/billing.md): keypad amounts, catalogue items by search or barcode, line edits,
 * discounts → payment sheet (one method or a split) → save once.
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
  const reference = useQuery({
    queryKey: billingKeys.reference(context.shopId),
    queryFn: () => deps.products.reference(context.shopId),
  });

  const [lines, setLines] = useState<BillLine[]>([]);
  const [entry, setEntry] = useState('');
  const [label, setLabel] = useState('');
  const [discountText, setDiscountText] = useState('');
  const [searchText, setSearchText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [editor, setEditor] = useState<LineEditor | null>(null);
  const [scan, setScan] = useState<ScanState>({ kind: 'closed' });
  const [phase, setPhase] = useState<BillingPhase>('editing');
  const [chosenMethod, setChosenMethod] = useState<BillMethod | null>(null);
  const [split, setSplit] = useState<{ method: BillMethod; amountText: string } | null>(null);
  const [customer, setCustomer] = useState<BillCustomer | null>(null);
  const [customerText, setCustomerText] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [newCustomer, setNewCustomer] = useState<{ id: string; name: string; phoneText: string } | null>(
    null,
  );
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [tenderedText, setTenderedText] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorParams, setErrorParams] = useState<Record<string, string | number>>({});
  const attempt = useRef<SaleAttempt | null>(null);
  const source = useRef<'keypad' | 'search' | 'scan'>('keypad');
  const busy = useRef(false);
  const scanBusy = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText]);
  useEffect(() => {
    const timer = setTimeout(() => setCustomerQuery(customerText.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [customerText]);
  const customerResults = useQuery({
    queryKey: [...billingKeys.all(context.shopId), 'customers', customerQuery],
    queryFn: () => deps.customers!.search(context.shopId, customerQuery),
    enabled: customerQuery.length > 0 && !!deps.customers,
  });
  const results = useQuery({
    queryKey: billingKeys.search(context.shopId, debounced),
    queryFn: () => deps.products.search(context.shopId, debounced),
    enabled: debounced.length > 0,
  });

  const s = settings.data;
  const methods = useMemo(
    () =>
      PAYABLE.filter(
        (m) =>
          s?.enabledPaymentMethods.includes(m) &&
          (m !== 'udhaar' || (context.canGiveUdhaar === true && !!deps.customers)),
      ),
    [context.canGiveUdhaar, deps.customers, s?.enabledPaymentMethods],
  );
  const method = chosenMethod && methods.includes(chosenMethod) ? chosenMethod : (methods[0] ?? null);
  const limitBp = s ? discountLimitBp(context.role, s) : 0;
  const canDiscount = context.canDiscount && limitBp > 0;
  const canOverridePrice = context.canOverridePrice && (s?.priceOverrideAllowed ?? false);

  const discountPaise = canDiscount ? (parseRupeesToPaise(discountText) ?? 0) : 0;
  const draft = useMemo<BillDraft>(
    () => ({ lines, billDiscountPaise: discountPaise }),
    [lines, discountPaise],
  );
  const totals = useMemo(() => {
    if (!s) return null;
    try {
      const t = draftTotals(draft, s);
      return discountAllowed(t.discountPaise, t.subtotalPaise, limitBp) ? t : null;
    } catch {
      return null; // a discount larger than the bill
    }
  }, [draft, limitBp, s]);
  const total = totals?.totalPaise ?? 0;

  const secondPaise = split ? (parseRupeesToPaise(split.amountText) ?? 0) : 0;
  const parts: BillPart[] | null = method
    ? splitPayments<BillMethod>(
        total,
        method,
        split ? { method: split.method, amountPaise: secondPaise } : null,
      )
    : null;
  const payments = parts
    ? parts.filter((p): p is { method: PaymentMethod; amountPaise: number } => p.method !== 'udhaar')
    : null;
  const udhaarPaise = parts?.find((p) => p.method === 'udhaar')?.amountPaise ?? 0;
  const overLimit =
    customer !== null &&
    customer.creditLimitPaise !== null &&
    customer.balancePaise + udhaarPaise > customer.creditLimitPaise;
  const cashDue = payments?.find((p) => p.method === 'cash')?.amountPaise ?? 0;
  const tenderedPaise = parseRupeesToPaise(tenderedText);
  const change = cashDue > 0 && tenderedPaise !== null ? changeDue(tenderedPaise, cashDue) : null;
  const upiPaise = payments?.find((p) => p.method === 'upi')?.amountPaise ?? 0;
  const upiUri =
    s?.upiVpa && upiPaise > 0
      ? upiPaymentUri({ vpa: s.upiVpa, payeeName: context.shopName, amountPaise: upiPaise })
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

  // ---- keypad ----------------------------------------------------------------------------
  const press = useCallback((key: KeypadKey) => setEntry((e) => pressKeypad(e, key)), []);

  const takeEntry = useCallback((): BillLine | null => {
    const amountPaise = keypadToPaise(entry);
    if (amountPaise === null) return null;
    return { kind: 'quick', key: deps.newId(), label: label.trim(), amountPaise };
  }, [deps, entry, label]);

  const addLine = useCallback(() => {
    const line = takeEntry();
    if (!line) return;
    setLines((ls) => [...ls, line]);
    setEntry('');
    setLabel('');
    changed();
  }, [changed, takeEntry]);

  // ---- catalogue items -------------------------------------------------------------------
  const addProduct = useCallback(
    (product: CatalogueProduct, how: 'search' | 'scan') => {
      const ref = reference.data;
      if (!ref) return;
      setLines((ls) => addProductLine(ls, productLine(product, ref, deps.newId())));
      source.current = how;
      changed();
    },
    [changed, deps, reference.data],
  );

  const pickResult = useCallback(
    (product: CatalogueProduct) => {
      addProduct(product, 'search');
      setSearchText('');
      setDebounced('');
    },
    [addProduct],
  );

  const openScanner = useCallback(() => setScan({ kind: 'scanning' }), []);
  const closeScanner = useCallback(() => setScan({ kind: 'closed' }), []);

  /** A barcode from the camera: adds the item (one more if it is already on the bill) or reports it unknown. */
  const scanned = useCallback(
    async (code: string) => {
      if (scanBusy.current) return;
      scanBusy.current = true;
      try {
        const product = await deps.products.byBarcode(context.shopId, code);
        if (product) {
          addProduct(product, 'scan');
          setScan({ kind: 'closed' });
        } else {
          setScan({ kind: 'unknown', code });
        }
      } catch (error) {
        setScan({ kind: 'closed' });
        fail(translateError(error).messageKey);
      } finally {
        scanBusy.current = false;
      }
    },
    [addProduct, context.shopId, deps, fail],
  );

  // ---- line editor -----------------------------------------------------------------------
  const removeLine = useCallback(
    (key: string) => {
      setLines((ls) => ls.filter((l) => l.key !== key));
      setEditor(null);
      changed();
    },
    [changed],
  );

  const openLine = useCallback(
    (key: string) => {
      const line = lines.find((l) => l.key === key);
      if (!line || line.kind !== 'product') return;
      setErrorKey(null);
      setEditor({
        key,
        quantityText: formatQuantity(quantityMilli(line.quantityMilli)),
        amountText: '',
        priceText: rupees(line.unitPricePaise),
        discountText: line.lineDiscountPaise ? rupees(line.lineDiscountPaise) : '',
      });
    },
    [lines],
  );

  const editLine = useCallback(
    (patch: Partial<Omit<LineEditor, 'key'>>) => setEditor((e) => (e ? { ...e, ...patch } : e)),
    [],
  );
  const closeLine = useCallback(() => setEditor(null), []);

  /** Applies the editor: price first (override), then amount ("₹40 worth") or quantity, then discount. */
  const saveLine = useCallback(() => {
    if (!editor) return;
    const line = lines.find((l): l is ProductLine => l.key === editor.key && l.kind === 'product');
    if (!line) return;
    let next: ProductLine = { ...line };
    if (canOverridePrice) {
      const price = parseRupeesToPaise(editor.priceText);
      if (price === null) return fail('billing.errors.INVALID_PRICE');
      next = { ...next, unitPricePaise: price };
    }
    if (editor.amountText.trim()) {
      const amount = parseRupeesToPaise(editor.amountText);
      const q = amount === null ? null : quantityFromAmount(next, amount);
      if (q === null) return fail('billing.errors.INVALID_AMOUNT');
      next = { ...next, quantityMilli: q, entryMode: 'amount' };
    } else {
      const q = quantityFromText(editor.quantityText, line.allowsFraction);
      if (q === null) {
        return fail(
          line.allowsFraction ? 'billing.errors.INVALID_QUANTITY' : 'billing.errors.WHOLE_QUANTITY',
        );
      }
      next = { ...next, quantityMilli: q, entryMode: 'quantity' };
    }
    const lineDiscount = canDiscount ? (parseRupeesToPaise(editor.discountText) ?? 0) : 0;
    if (lineDiscount > lineAmount(next)) {
      return fail('billing.errors.DISCOUNT_LIMIT', { max: lineAmount(next) / 100 });
    }
    next = { ...next, lineDiscountPaise: lineDiscount };
    setLines((ls) => ls.map((l) => (l.key === line.key ? next : l)));
    setEditor(null);
    changed();
  }, [canDiscount, canOverridePrice, changed, editor, fail, lines]);

  // ---- discount and payment --------------------------------------------------------------
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
    if (all.length === 0 || !s) return fail('billing.errors.EMPTY_BILL');
    let ok = false;
    let subtotal = 0;
    try {
      const t = draftTotals({ lines: all, billDiscountPaise: discountPaise }, s);
      subtotal = t.subtotalPaise;
      ok = discountAllowed(t.discountPaise, t.subtotalPaise, limitBp);
    } catch {
      subtotal = all.reduce((sum, l) => sum + lineAmount(l), 0);
    }
    if (!ok) return fail('billing.errors.DISCOUNT_LIMIT', { max: maxDiscount(subtotal, limitBp) / 100 });
    setErrorKey(null);
    setTenderedText('');
    setSplit(null);
    setPhase('paying');
  }, [changed, discountPaise, fail, limitBp, lines, s, takeEntry]);

  const closePayment = useCallback(() => setPhase('editing'), []);

  const selectMethod = useCallback(
    (m: BillMethod) => {
      setChosenMethod(m);
      changed();
    },
    [changed],
  );

  const toggleSplit = useCallback(() => {
    setSplit((sp) => (sp ? null : { method: methods.find((m) => m !== method) ?? 'cash', amountText: '' }));
    changed();
  }, [changed, method, methods]);

  const setSplitMethod = useCallback(
    (m: BillMethod) => {
      setSplit((sp) => (sp ? { ...sp, method: m } : sp));
      changed();
    },
    [changed],
  );
  const setSplitAmount = useCallback(
    (text: string) => {
      setSplit((sp) => (sp ? { ...sp, amountText: text } : sp));
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
    setSplit(null);
    setCustomer(null);
    setCustomerText('');
    setNewCustomer(null);
    setPhase('editing');
    attempt.current = null;
    source.current = 'keypad';
  }, []);

  // ---- customer for udhaar ---------------------------------------------------------------
  const pickCustomer = useCallback(
    (c: BillCustomer | null) => {
      setCustomer(c);
      setCustomerText('');
      setCustomerQuery('');
      setNewCustomer(null);
      changed();
    },
    [changed],
  );
  const startNewCustomer = useCallback(
    () => setNewCustomer({ id: deps.newId(), name: customerText.trim(), phoneText: '' }),
    [customerText, deps],
  );
  const editNewCustomer = useCallback(
    (patch: Partial<{ name: string; phoneText: string }>) =>
      setNewCustomer((c) => (c ? { ...c, ...patch } : c)),
    [],
  );
  const cancelNewCustomer = useCallback(() => setNewCustomer(null), []);
  const saveNewCustomer = useCallback(async () => {
    if (!newCustomer || !deps.customers || addingCustomer) return;
    if (!newCustomer.name.trim()) return fail('billing.errors.CUSTOMER_NAME_REQUIRED');
    setAddingCustomer(true);
    setErrorKey(null);
    try {
      const created = await deps.customers.quickAdd({ ...newCustomer, shopId: context.shopId });
      pickCustomer(created);
    } catch (error) {
      fail(
        error instanceof Error && error.name === 'CustomerInputError'
          ? `customers.errors.${(error as Error & { reason: string }).reason}`
          : translateError(error).messageKey,
      );
    } finally {
      setAddingCustomer(false);
    }
  }, [addingCustomer, context.shopId, deps.customers, fail, newCustomer, pickCustomer]);

  const submit = useCallback(async () => {
    if (busy.current || !s) return;
    if (!payments) return fail('billing.errors.INVALID_SPLIT');
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
        payments,
        udhaarPaise,
        customerId: customer?.id ?? null,
        attempt: attempt.current,
        source: source.current,
      });
      reset();
      onCompleted(created.saleId);
    } catch (error) {
      if (error instanceof PriceChanged) {
        // Take the new price (unless the cashier overrode it) and let them check the total again.
        setLines((ls) =>
          ls.map((l) =>
            l.kind === 'product' && l.productId === error.productId
              ? {
                  ...l,
                  listPricePaise: error.currentPricePaise,
                  unitPricePaise:
                    l.unitPricePaise === l.listPricePaise ? error.currentPricePaise : l.unitPricePaise,
                }
              : l,
          ),
        );
        attempt.current = null;
        setPhase('editing');
        fail('billing.errors.PRICE_CHANGED');
      } else {
        setPhase('paying');
        if (error instanceof BillInputError) fail(`billing.errors.${error.reason}`);
        else if (error instanceof InvoiceSequenceConflict) fail('errors.DS_INVOICE_SEQUENCE_CONFLICT');
        else fail(translateError(error).messageKey);
      }
    } finally {
      busy.current = false;
    }
  }, [context, customer, deps, draft, fail, onCompleted, payments, reset, s, udhaarPaise]);

  return {
    state: {
      loading: settings.isPending || reference.isPending,
      settingsErrorKey: settings.isError
        ? translateError(settings.error).messageKey
        : reference.isError
          ? translateError(reference.error).messageKey
          : null,
      phase,
      lines,
      entry,
      entryPaise: keypadToPaise(entry),
      label,
      searchText,
      results: debounced ? (results.data ?? []) : [],
      searching: results.isFetching,
      scan,
      canManageProducts: context.canManageProducts,
      editor,
      editorLine: editor
        ? lines.find((l): l is ProductLine => l.key === editor.key && l.kind === 'product')
        : undefined,
      canOverridePrice,
      discountText,
      canDiscount,
      discountLimitPercent: limitBp / 100,
      totals,
      methods,
      method,
      split,
      payments,
      udhaarPaise,
      customer,
      customerText,
      customerResults: customerQuery ? (customerResults.data ?? []) : [],
      newCustomer,
      addingCustomer,
      canAddCustomer: context.canAddCustomer === true && !!deps.customers,
      overLimit,
      tenderedText,
      change,
      upiUri,
      upiPaise,
      errorKey,
      errorParams,
    },
    actions: {
      press,
      setLabel,
      addLine,
      setSearchText,
      pickResult,
      openScanner,
      closeScanner,
      scanned,
      openLine,
      editLine,
      closeLine,
      saveLine,
      removeLine,
      changeDiscount,
      openPayment,
      closePayment,
      selectMethod,
      toggleSplit,
      setSplitMethod,
      setSplitAmount,
      setCustomerText,
      pickCustomer,
      startNewCustomer,
      editNewCustomer,
      cancelNewCustomer,
      saveNewCustomer,
      setTenderedText,
      submit,
      reloadSettings: () => {
        void settings.refetch();
        void reference.refetch();
      },
    },
  };
}
