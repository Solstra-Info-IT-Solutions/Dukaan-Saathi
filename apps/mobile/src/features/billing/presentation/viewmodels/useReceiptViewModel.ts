import { useQuery } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type { GetSale, ShareReceipt } from '../../domain/usecases/billingUseCases';
import type { ReceiptLabels } from '../../domain/receipt';
import { billingKeys } from '../billingKeys';

export interface ReceiptViewModelDeps {
  getSale: GetSale;
  shareReceipt: ShareReceipt;
}

/** Receipt of one saved bill; shares it as PDF or WhatsApp text. */
export function useReceiptViewModel(deps: ReceiptViewModelDeps, shopId: string, saleId: string) {
  const sale = useQuery({
    queryKey: billingKeys.sale(shopId, saleId),
    queryFn: () => deps.getSale.execute(shopId, saleId),
  });
  const [sharing, setSharing] = useState<'pdf' | 'text' | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = useRef(false);

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

  return {
    state: {
      loading: sale.isPending,
      loadErrorKey: sale.isError ? translateError(sale.error).messageKey : null,
      sale: sale.data ?? null,
      sharing,
      errorKey,
    },
    actions: {
      reload: () => void sale.refetch(),
      sharePdf: (labels: ReceiptLabels) => share('pdf', labels),
      shareText: (labels: ReceiptLabels) => share('text', labels),
    },
  };
}
