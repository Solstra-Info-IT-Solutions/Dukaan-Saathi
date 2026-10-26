import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type { CustomerSort, RepaymentMethod } from '../../domain/entities/Customers';
import {
  type AdjustBalance,
  buildReminderMessage,
  CustomerInputError,
  type GetCustomerLedger,
  type ListCustomers,
  type RecordRepayment,
  type SaveCustomer,
  whatsappUrl,
} from '../../domain/usecases/customerUseCases';

export const customerKeys = {
  all: (shopId: string) => ['customers', shopId] as const,
  list: (shopId: string, query: string, sort: CustomerSort, udhaarOnly: boolean) =>
    ['customers', shopId, 'list', query, sort, udhaarOnly] as const,
  ledger: (shopId: string, customerId: string) => ['customers', shopId, 'ledger', customerId] as const,
};

export const SEARCH_DEBOUNCE_MS = 250;

const errorKeyOf = (error: unknown) =>
  error instanceof CustomerInputError ? `customers.errors.${error.reason}` : translateError(error).messageKey;

/** Same operation id while the typed values stay the same, so a retry is not counted twice. */
function useOperationId(newId: () => string) {
  const op = useRef<{ values: string; id: string } | null>(null);
  return {
    for: (values: string) => {
      if (op.current?.values !== values) op.current = { values, id: newId() };
      return op.current.id;
    },
    done: () => {
      op.current = null;
    },
  };
}

export interface UdhaarListViewModelDeps {
  listCustomers: ListCustomers;
}

/** Udhaar list (features/customers-and-udhaar.md): who owes what, highest or oldest first, and search. */
export function useUdhaarListViewModel(deps: UdhaarListViewModelDeps, shopId: string) {
  const [searchText, setSearchText] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<CustomerSort>('highest');
  const [udhaarOnly, setUdhaarOnly] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText]);
  const list = useQuery({
    queryKey: customerKeys.list(shopId, query, sort, udhaarOnly),
    queryFn: () => deps.listCustomers.execute(shopId, { query, sort, udhaarOnly }),
  });
  return {
    state: {
      searchText,
      sort,
      udhaarOnly,
      items: list.data?.rows ?? [],
      totalOutstandingPaise: list.data?.totalOutstandingPaise ?? 0,
      customersWithUdhaar: list.data?.customersWithUdhaar ?? 0,
      loading: list.isPending,
      loadErrorKey: list.isError ? translateError(list.error).messageKey : null,
    },
    actions: { setSearchText, setSort, setUdhaarOnly, reload: () => void list.refetch() },
  };
}

export interface CustomerFormViewModelDeps {
  saveCustomer: SaveCustomer;
  newId: () => string;
}

/** New customer; owners and managers can also set udhaar already owed and a credit limit. */
export function useCustomerFormViewModel(
  deps: CustomerFormViewModelDeps,
  shopId: string,
  onSaved: (customerId: string) => void,
) {
  const queryClient = useQueryClient();
  const [id] = useState(() => deps.newId());
  const [name, setName] = useState('');
  const [phoneText, setPhoneText] = useState('');
  const [openingText, setOpeningText] = useState('');
  const [creditLimitText, setCreditLimitText] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = useRef(false);

  const save = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setErrorKey(null);
    try {
      const saved = await deps.saveCustomer.execute({
        id,
        shopId,
        name,
        phoneText,
        note,
        openingText,
        creditLimitText,
      });
      await queryClient.invalidateQueries({ queryKey: customerKeys.all(shopId) });
      onSaved(saved.id);
    } catch (error) {
      setErrorKey(errorKeyOf(error));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [creditLimitText, deps, id, name, note, onSaved, openingText, phoneText, queryClient, shopId]);

  return {
    state: { name, phoneText, openingText, creditLimitText, note, saving, errorKey },
    actions: { setName, setPhoneText, setOpeningText, setCreditLimitText, setNote, save },
  };
}

export interface CustomerLedgerViewModelDeps {
  getLedger: GetCustomerLedger;
  recordRepayment: RecordRepayment;
  adjustBalance: AdjustBalance;
  getUpiVpa: (shopId: string) => Promise<string | null>;
  openUrl: (url: string) => Promise<unknown>;
  newId: () => string;
}

export interface LedgerShop {
  shopId: string;
  shopName: string;
  deviceId: string;
}

/** One customer: balance, every entry with the balance after it, repayment, owner adjustment, reminder. */
export function useCustomerLedgerViewModel(
  deps: CustomerLedgerViewModelDeps,
  shop: LedgerShop,
  customerId: string,
  language: 'en' | 'hi',
) {
  const queryClient = useQueryClient();
  const ledger = useQuery({
    queryKey: customerKeys.ledger(shop.shopId, customerId),
    queryFn: () => deps.getLedger.execute(shop.shopId, customerId),
  });
  const upi = useQuery({
    queryKey: ['customers', shop.shopId, 'upi'],
    queryFn: () => deps.getUpiVpa(shop.shopId),
  });

  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<RepaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [paying, setPaying] = useState(false);
  const [payErrorKey, setPayErrorKey] = useState<string | null>(null);
  /** The last payment was saved on this phone and will be sent when online. */
  const [payQueued, setPayQueued] = useState(false);
  const [adjustDirection, setAdjustDirection] = useState<'add' | 'reduce'>('reduce');
  const [adjustText, setAdjustText] = useState('');
  const [reason, setReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustErrorKey, setAdjustErrorKey] = useState<string | null>(null);
  const busy = useRef(false);
  const payOp = useOperationId(deps.newId);
  const adjustOp = useOperationId(deps.newId);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: customerKeys.all(shop.shopId) }),
    [queryClient, shop.shopId],
  );

  const pay = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setPaying(true);
    setPayErrorKey(null);
    setPayQueued(false);
    try {
      const saved = await deps.recordRepayment.execute({
        clientOperationId: payOp.for(`${amountText}|${method}|${note.trim()}`),
        shopId: shop.shopId,
        deviceId: shop.deviceId,
        customerId,
        amountText,
        method,
        note,
        label: ledger.data?.customer.name ?? null,
      });
      payOp.done();
      setPayQueued(saved.queued === true);
      setAmountText('');
      setNote('');
      await refresh();
    } catch (error) {
      setPayErrorKey(errorKeyOf(error));
    } finally {
      busy.current = false;
      setPaying(false);
    }
  }, [amountText, customerId, deps, ledger.data, method, note, payOp, refresh, shop]);

  const adjust = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setAdjusting(true);
    setAdjustErrorKey(null);
    try {
      await deps.adjustBalance.execute({
        clientOperationId: adjustOp.for(`${adjustDirection}|${adjustText}|${reason.trim()}`),
        shopId: shop.shopId,
        customerId,
        direction: adjustDirection,
        amountText: adjustText,
        reason,
      });
      adjustOp.done();
      setAdjustText('');
      setReason('');
      await refresh();
    } catch (error) {
      setAdjustErrorKey(errorKeyOf(error));
    } finally {
      busy.current = false;
      setAdjusting(false);
    }
  }, [adjustDirection, adjustOp, adjustText, customerId, deps, reason, refresh, shop.shopId]);

  const customer = ledger.data?.customer ?? null;
  const reminder =
    customer && customer.balancePaise > 0
      ? buildReminderMessage({
          language,
          customerName: customer.name,
          shopName: shop.shopName,
          balancePaise: customer.balancePaise,
          upiVpa: upi.data ?? null,
        })
      : null;

  /** Opens WhatsApp with the reminder filled in; the shopkeeper sends it. */
  const remind = useCallback(async () => {
    if (!customer || !reminder) return;
    await deps.openUrl(whatsappUrl(customer.phone, reminder));
  }, [customer, deps, reminder]);

  return {
    state: {
      loading: ledger.isPending,
      loadErrorKey: ledger.isError ? translateError(ledger.error).messageKey : null,
      customer,
      entries: ledger.data?.entries ?? [],
      reminder,
      amountText,
      method,
      note,
      paying,
      payErrorKey,
      payQueued,
      adjustDirection,
      adjustText,
      reason,
      adjusting,
      adjustErrorKey,
    },
    actions: {
      setAmountText,
      setMethod,
      setNote,
      pay,
      setAdjustDirection,
      setAdjustText,
      setReason,
      adjust,
      remind,
      reload: () => void ledger.refetch(),
    },
  };
}
