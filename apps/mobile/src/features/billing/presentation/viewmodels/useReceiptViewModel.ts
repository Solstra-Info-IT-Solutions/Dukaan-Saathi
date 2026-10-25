import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import {
  BillInputError,
  type GetSale,
  type ShareReceipt,
  type VoidSale,
} from '../../domain/usecases/billingUseCases';
import type { ReceiptLabels } from '../../domain/receipt';
import { billingKeys } from '../billingKeys';

export interface ReceiptViewModelDeps {
  getSale: GetSale;
  shareReceipt: ShareReceipt;
  voidSale: VoidSale;
  newId: () => string;
}

/** Receipt of one saved bill; shares it as PDF or WhatsApp text and voids it (with a reason). */
export function useReceiptViewModel(deps: ReceiptViewModelDeps, shopId: string, saleId: string) {
  const queryClient = useQueryClient();
  const sale = useQuery({
    queryKey: billingKeys.sale(shopId, saleId),
    queryFn: () => deps.getSale.execute(shopId, saleId),
  });
  const [sharing, setSharing] = useState<'pdf' | 'text' | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const busy = useRef(false);
  /** One operation id per void request text, so a retried void is not sent as a new one. */
  const voidOp = useRef<{ reason: string; id: string } | null>(null);

  const share = useCallback(
    async (kind: 'pdf' | 'text', labels: ReceiptLabels) => {
      if (busy.current || !sale.data) return;
      busy.current = true;
      setSharing(kind);
      setErrorKey(null);
      try {
        if (kind === 'pdf') await deps.shareReceipt.asPdf(sale.data, labels);
        else await deps.shareReceipt.asText(sale.data, labels);
      } catch {
        setErrorKey('billing.receipt.shareFailed');
      } finally {
        busy.current = false;
        setSharing(null);
      }
    },
    [deps, sale.data],
  );

  const confirmVoid = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setVoiding(true);
    setErrorKey(null);
    const text = reason.trim();
    if (voidOp.current?.reason !== text) voidOp.current = { reason: text, id: deps.newId() };
    try {
      const voided = await deps.voidSale.execute({
        shopId,
        saleId,
        reason: text,
        clientOperationId: voidOp.current.id,
      });
      queryClient.setQueryData(billingKeys.sale(shopId, saleId), voided);
      void queryClient.invalidateQueries({ queryKey: [...billingKeys.all(shopId), 'sales'] });
      setVoidOpen(false);
    } catch (error) {
      setErrorKey(
        error instanceof BillInputError ? `billing.errors.${error.reason}` : translateError(error).messageKey,
      );
    } finally {
      busy.current = false;
      setVoiding(false);
    }
  }, [deps, queryClient, reason, saleId, shopId]);

  return {
    state: {
      loading: sale.isPending,
      loadErrorKey: sale.isError ? translateError(sale.error).messageKey : null,
      sale: sale.data ?? null,
      sharing,
      errorKey,
      voidOpen,
      reason,
      voiding,
    },
    actions: {
      reload: () => void sale.refetch(),
      sharePdf: (labels: ReceiptLabels) => share('pdf', labels),
      shareText: (labels: ReceiptLabels) => share('text', labels),
      openVoid: () => {
        setErrorKey(null);
        setVoidOpen(true);
      },
      closeVoid: () => setVoidOpen(false),
      setReason,
      confirmVoid,
    },
  };
}
