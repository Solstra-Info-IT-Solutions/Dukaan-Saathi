import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type { PaymentMethod } from '../../domain/entities/Purchases';
import {
  type GetSupplierLedger,
  type ListSuppliers,
  PurchaseInputError,
  type RecordSupplierPayment,
  type SaveSupplier,
} from '../../domain/usecases/purchaseUseCases';

export const purchaseKeys = {
  all: (shopId: string) => ['purchases', shopId] as const,
  suppliers: (shopId: string) => ['purchases', shopId, 'suppliers'] as const,
  ledger: (shopId: string, supplierId: string) => ['purchases', shopId, 'ledger', supplierId] as const,
};

const errorKeyOf = (error: unknown) =>
  error instanceof PurchaseInputError ? `purchases.errors.${error.reason}` : translateError(error).messageKey;

export interface SuppliersViewModelDeps {
  listSuppliers: ListSuppliers;
}

/** Suppliers with what the shop owes each one. */
export function useSuppliersViewModel(deps: SuppliersViewModelDeps, shopId: string) {
  const list = useQuery({
    queryKey: purchaseKeys.suppliers(shopId),
    queryFn: () => deps.listSuppliers.execute(shopId),
  });
  const items = list.data ?? [];
  return {
    state: {
      items,
      totalOwedPaise: items.reduce((s, x) => s + Math.max(0, x.balancePaise), 0),
      loading: list.isPending,
      loadErrorKey: list.isError ? translateError(list.error).messageKey : null,
    },
    actions: { reload: () => void list.refetch() },
  };
}

export interface SupplierFormViewModelDeps {
  saveSupplier: SaveSupplier;
  newId: () => string;
}

/** New supplier with an optional opening balance (what the shop already owes). */
export function useSupplierFormViewModel(
  deps: SupplierFormViewModelDeps,
  shopId: string,
  onSaved: () => void,
) {
  const queryClient = useQueryClient();
  const [id] = useState(() => deps.newId());
  const [name, setName] = useState('');
  const [phoneText, setPhoneText] = useState('');
  const [openingText, setOpeningText] = useState('');
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
      await deps.saveSupplier.execute({ id, shopId, name, phoneText, openingText, note });
      await queryClient.invalidateQueries({ queryKey: purchaseKeys.all(shopId) });
      onSaved();
    } catch (error) {
      setErrorKey(errorKeyOf(error));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [deps, id, name, note, onSaved, openingText, phoneText, queryClient, shopId]);

  return {
    state: { name, phoneText, openingText, note, saving, errorKey },
    actions: { setName, setPhoneText, setOpeningText, setNote, save },
  };
}

export interface SupplierDetailViewModelDeps {
  listSuppliers: ListSuppliers;
  getLedger: GetSupplierLedger;
  paySupplier: RecordSupplierPayment;
  newId: () => string;
}

/** One supplier: balance, ledger, and paying them. */
export function useSupplierDetailViewModel(
  deps: SupplierDetailViewModelDeps,
  shopId: string,
  deviceId: string,
  supplierId: string,
) {
  const queryClient = useQueryClient();
  const suppliers = useQuery({
    queryKey: purchaseKeys.suppliers(shopId),
    queryFn: () => deps.listSuppliers.execute(shopId),
  });
  const ledger = useQuery({
    queryKey: purchaseKeys.ledger(shopId, supplierId),
    queryFn: () => deps.getLedger.execute(shopId, supplierId),
  });
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [paying, setPaying] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = useRef(false);
  const op = useRef<{ values: string; id: string } | null>(null);

  const pay = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setPaying(true);
    setErrorKey(null);
    const values = `${amountText}|${method}|${note.trim()}`;
    if (op.current?.values !== values) op.current = { values, id: deps.newId() };
    try {
      await deps.paySupplier.execute({
        clientOperationId: op.current.id,
        shopId,
        deviceId,
        supplierId,
        amountText,
        method,
        note,
      });
      op.current = null;
      setAmountText('');
      setNote('');
      await queryClient.invalidateQueries({ queryKey: purchaseKeys.all(shopId) });
    } catch (error) {
      setErrorKey(errorKeyOf(error));
    } finally {
      busy.current = false;
      setPaying(false);
    }
  }, [amountText, deps, deviceId, method, note, queryClient, shopId, supplierId]);

  return {
    state: {
      loading: suppliers.isPending,
      loadErrorKey: suppliers.isError ? translateError(suppliers.error).messageKey : null,
      supplier: suppliers.data?.find((s) => s.id === supplierId) ?? null,
      ledger: ledger.data ?? [],
      amountText,
      method,
      note,
      paying,
      errorKey,
    },
    actions: { setAmountText, setMethod, setNote, pay, reload: () => void suppliers.refetch() },
  };
}
