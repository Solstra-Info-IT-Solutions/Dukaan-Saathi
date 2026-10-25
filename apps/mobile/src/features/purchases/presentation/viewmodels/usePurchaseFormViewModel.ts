import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type {
  CatalogueProduct,
  PaymentMethod,
  PurchaseLineDraft,
  PurchaseProductFinder,
  PurchaseResult,
} from '../../domain/entities/Purchases';
import {
  type ListSuppliers,
  PurchaseInputError,
  purchaseLine,
  purchaseTotal,
  type ReceivePurchase,
} from '../../domain/usecases/purchaseUseCases';
import { purchaseKeys } from './useSuppliersViewModel';

export interface PurchaseFormViewModelDeps {
  listSuppliers: ListSuppliers;
  receivePurchase: ReceivePurchase;
  products: PurchaseProductFinder;
  newId: () => string;
  /** Called after a purchase so stock and catalogue screens refresh. */
  onReceived?: () => void;
}

/** Goods received: supplier (optional), items with quantity and cost, optional new selling price, paid now. */
export function usePurchaseFormViewModel(
  deps: PurchaseFormViewModelDeps,
  shopId: string,
  deviceId: string,
  initialSupplierId: string | null,
) {
  const queryClient = useQueryClient();
  const suppliers = useQuery({
    queryKey: purchaseKeys.suppliers(shopId),
    queryFn: () => deps.listSuppliers.execute(shopId),
  });
  const reference = useQuery({
    queryKey: ['purchases', shopId, 'reference'],
    queryFn: () => deps.products.reference(shopId),
  });
  const [supplierId, setSupplierId] = useState<string | null>(initialSupplierId);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [lines, setLines] = useState<PurchaseLineDraft[]>([]);
  const [searchText, setSearchText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [paidText, setPaidText] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorLine, setErrorLine] = useState<string | null>(null);
  const busy = useRef(false);
  const op = useRef<{ values: string; id: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(searchText.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchText]);
  const results = useQuery({
    queryKey: ['purchases', shopId, 'search', debounced],
    queryFn: () => deps.products.search(shopId, debounced),
    enabled: debounced.length > 0,
  });

  const addProduct = useCallback(
    (product: CatalogueProduct) => {
      const ref = reference.data;
      if (!ref) return;
      setLines((ls) =>
        ls.some((l) => l.productId === product.id) ? ls : [...ls, purchaseLine(product, ref, deps.newId())],
      );
      setSearchText('');
      setDebounced('');
    },
    [deps, reference.data],
  );

  const editLine = useCallback(
    (key: string, patch: Partial<Pick<PurchaseLineDraft, 'quantityText' | 'costText' | 'newPriceText'>>) =>
      setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))),
    [],
  );
  const removeLine = useCallback((key: string) => setLines((ls) => ls.filter((l) => l.key !== key)), []);

  const submit = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setErrorKey(null);
    setErrorLine(null);
    const values = JSON.stringify([supplierId, invoiceNo, lines, paidText, method]);
    if (op.current?.values !== values) op.current = { values, id: deps.newId() };
    try {
      setResult(
        await deps.receivePurchase.execute({
          clientOperationId: op.current.id,
          shopId,
          deviceId,
          supplierId,
          invoiceNo,
          lines,
          paidText,
          method,
        }),
      );
      await queryClient.invalidateQueries({ queryKey: purchaseKeys.all(shopId) });
      deps.onReceived?.();
    } catch (error) {
      if (error instanceof PurchaseInputError) {
        setErrorKey(`purchases.errors.${error.reason}`);
        setErrorLine(error.lineKey ?? null);
      } else {
        setErrorKey(translateError(error).messageKey);
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [deps, deviceId, invoiceNo, lines, method, paidText, queryClient, shopId, supplierId]);

  return {
    state: {
      loading: suppliers.isPending || reference.isPending,
      suppliers: suppliers.data ?? [],
      supplierId,
      invoiceNo,
      lines,
      searchText,
      results: debounced ? (results.data ?? []) : [],
      totalPaise: purchaseTotal(lines),
      paidText,
      method,
      saving,
      result,
      errorKey,
      errorLine,
    },
    actions: {
      setSupplierId,
      setInvoiceNo,
      setSearchText,
      addProduct,
      editLine,
      removeLine,
      setPaidText,
      setMethod,
      submit,
    },
  };
}
