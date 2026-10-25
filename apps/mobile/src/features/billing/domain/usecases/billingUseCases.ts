import { financialYear } from '@ds/domain-core';
import { draftTotals } from '../billMath';
import {
  type BillDraft,
  type BillingContext,
  type BillingSettings,
  type CreatedSale,
  type InvoiceCounterStore,
  InvoiceSequenceConflict,
  type PaymentMethod,
  type ReceiptSharer,
  type Sale,
  type SaleAttempt,
  type SaleCommand,
} from '../entities/Bill';
import type { BillingRepository } from '../repositories/BillingRepository';
import { buildReceipt, type ReceiptLabels, receiptHtml, receiptText } from '../receipt';

export class BillInputError extends Error {
  constructor(readonly reason: 'EMPTY_BILL' | 'METHOD_NOT_ENABLED') {
    super(reason);
    this.name = 'BillInputError';
  }
}

/** Key of this phone's invoice series in the counter store. */
export const seriesKey = (shopId: string, deviceId: string, fy: string) => `${shopId}_${deviceId}_${fy}`;

/**
 * Saves a quick bill (features/billing.md, ADR-035):
 *  - the next invoice number is this phone's last number + 1;
 *  - if the server reports another number as next (e.g. the phone lost its counter), the counter is
 *    moved there first and the bill is sent once more with the same operation id;
 *  - the caller keeps `attempt` for retries, so a repeated tap or a retry after a timeout returns
 *    the bill already saved instead of creating a second one.
 */
export class CreateQuickSale {
  constructor(
    private readonly billing: BillingRepository,
    private readonly counter: InvoiceCounterStore,
  ) {}

  async execute(input: {
    context: BillingContext;
    settings: BillingSettings;
    draft: BillDraft;
    method: PaymentMethod;
    attempt: SaleAttempt;
  }): Promise<CreatedSale> {
    const { context, settings, draft, method, attempt } = input;
    if (draft.lines.length === 0) throw new BillInputError('EMPTY_BILL');
    if (!settings.enabledPaymentMethods.includes(method)) throw new BillInputError('METHOD_NOT_ENABLED');

    const totals = draftTotals(draft, settings);
    const fy = financialYear(new Date(attempt.occurredAt), settings.timezone);
    const key = seriesKey(context.shopId, context.deviceId, fy);
    const stored = (await this.counter.last(key)) ?? 0;
    const base = Math.max(stored, fy === context.fy ? context.lastSeq : 0);

    const command = (seq: number): SaleCommand => ({
      clientOperationId: attempt.clientOperationId,
      shopId: context.shopId,
      deviceId: context.deviceId,
      invoice: { fy, seq },
      occurredAt: attempt.occurredAt,
      origin: 'online',
      source: 'keypad',
      lines: draft.lines.map((l) => ({
        kind: 'quick' as const,
        amountPaise: l.amountPaise,
        ...(l.label.trim() ? { label: l.label.trim() } : {}),
      })),
      ...(draft.billDiscountPaise > 0 ? { billDiscountPaise: draft.billDiscountPaise } : {}),
      payments: totals.totalPaise > 0 ? [{ method, amountPaise: totals.totalPaise }] : [],
      clientTotals: totals,
    });

    let created: CreatedSale;
    try {
      created = await this.billing.createSale(command(base + 1));
    } catch (error) {
      if (!(error instanceof InvoiceSequenceConflict)) throw error;
      // Remember the server's number first: a retry of this attempt then sends the same payload.
      await this.counter.save(key, error.expectedSeq - 1);
      created = await this.billing.createSale(command(error.expectedSeq));
    }
    await this.counter.save(key, created.seq);
    return created;
  }
}

export class GetSale {
  constructor(private readonly billing: BillingRepository) {}
  execute(shopId: string, saleId: string): Promise<Sale> {
    return this.billing.getSale(shopId, saleId);
  }
}

export class ShareReceipt {
  constructor(private readonly sharer: ReceiptSharer) {}

  asPdf(sale: Sale, labels: ReceiptLabels): Promise<void> {
    const html = receiptHtml(buildReceipt(sale, labels), labels);
    return this.sharer.sharePdf(html, sale.invoiceNumber.replace(/[^A-Za-z0-9-]/g, '_'));
  }

  asText(sale: Sale, labels: ReceiptLabels): Promise<void> {
    return this.sharer.shareText(receiptText(buildReceipt(sale, labels), labels));
  }
}
