import { formatQuantity, parseQuantity, quantityMilli } from '@ds/domain-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import {
  BillInputError,
  type CreateSaleReturn,
  type GetSale,
  type ShareReceipt,
  type VoidSale,
} from '../../domain/usecases/billingUseCases';
import type { RefundMethod } from '../../domain/entities/Bill';
import type { ReceiptLabels } from '../../domain/receipt';
import { billingKeys } from '../billingKeys';

export interface ReceiptViewModelDeps {
  getSale: GetSale;
  shareReceipt: ShareReceipt;
  voidSale: VoidSale;
  createReturn: CreateSaleReturn;
  newId: () => string;
}

/** Receipt of one saved bill; shares it as PDF or WhatsApp text, takes returns and voids it (with a reason). */
export function useReceiptViewModel(
  deps: ReceiptViewModelDeps,
  shopId: string,
  saleId: string,
  deviceId: string,
) {
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
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnQty, setReturnQty] = useState<Record<number, string>>({});
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('cash');
  const [returnReason, setReturnReason] = useState('');
  const [returning, setReturning] = useState(false);
  const returnOp = useRef<{ values: string; id: string } | null>(null);

  /** Lines that still have something to return, with how much. */
  const returnable = (sale.data?.lines ?? [])
    .map((l) => ({ line: l, leftMilli: l.quantityMilli - (l.returnedQuantityMilli ?? 0) }))
    .filter((x) => x.leftMilli > 0);

  const openReturn = useCallback(() => {
    setErrorKey(null);
    setReturnReason('');
    setReturnQty(
      Object.fromEntries(returnable.map((x) => [x.line.lineNo, formatQuantity(quantityMilli(x.leftMilli))])),
    );
    setReturnOpen(true);
  }, [returnable]);

  const confirmReturn = useCallback(async () => {
    if (busy.current) return;
    const lines: { lineNo: number; quantityMilli: number }[] = [];
    for (const x of returnable) {
      const text = (returnQty[x.line.lineNo] ?? '').trim();
      if (!text) continue;
      const q = parseQuantity(text);
      if (q === null || q > x.leftMilli) {
        setErrorKey('billing.returns.invalidQuantity');
        return;
      }
      if (q > 0) lines.push({ lineNo: x.line.lineNo, quantityMilli: q });
    }
    busy.current = true;
    setReturning(true);
    setErrorKey(null);
    const values = JSON.stringify([lines, refundMethod, returnReason.trim()]);
    if (returnOp.current?.values !== values) returnOp.current = { values, id: deps.newId() };
    try {
      await deps.createReturn.execute({
        clientOperationId: returnOp.current.id,
        shopId,
        deviceId,
        saleId,
        lines,
        refundMethod,
        reason: returnReason,
      });
      setReturnOpen(false);
      returnOp.current = null;
      await queryClient.invalidateQueries({ queryKey: billingKeys.sale(shopId, saleId) });
    } catch (error) {
      setErrorKey(
        error instanceof BillInputError ? `billing.errors.${error.reason}` : translateError(error).messageKey,
      );
    } finally {
      busy.current = false;
      setReturning(false);
    }
  }, [deps, deviceId, queryClient, refundMethod, returnQty, returnReason, returnable, saleId, shopId]);

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
      returnable,
      returnOpen,
      returnQty,
      refundMethod,
      /** Udhaar only when the bill has a customer (the amount comes off their balance). */
      refundMethods: (sale.data?.customer
        ? ['cash', 'upi', 'card', 'other', 'udhaar']
        : ['cash', 'upi', 'card', 'other']) as RefundMethod[],
      returnReason,
      returning,
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
      openReturn,
      closeReturn: () => setReturnOpen(false),
      setReturnQty: (lineNo: number, text: string) => setReturnQty((q) => ({ ...q, [lineNo]: text })),
      setRefundMethod,
      setReturnReason,
      confirmReturn,
    },
  };
}
