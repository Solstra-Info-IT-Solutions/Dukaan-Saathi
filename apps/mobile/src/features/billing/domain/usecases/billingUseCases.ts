import { financialYear } from '@ds/domain-core';
import { draftTotals, isPriceOverride } from '../billMath';
import {
  type BillDraft,
  type BillingContext,
  type BillingSettings,
  type BillLine,
  type CreatedSale,
  type InvoiceCounterStore,
  InvoiceSequenceConflict,
  type PaymentPart,
  type ReceiptSharer,
  type Sale,
  type SaleAttempt,
  type SaleCommand,
  type SaleFilter,
} from '../entities/Bill';
import type { BillingRepository, SalePage } from '../repositories/BillingRepository';
import { buildReceipt, type ReceiptLabels, receiptHtml, receiptText } from '../receipt';

export class BillInputError extends Error {
  constructor(
    readonly reason: 'EMPTY_BILL' | 'METHOD_NOT_ENABLED' | 'PAYMENTS_DO_NOT_MATCH' | 'REASON_REQUIRED',
  ) {
    super(reason);
    this.name = 'BillInputError';
  }
}

/** Key of this phone's invoice series in the counter store. */
export const seriesKey = (shopId: string, deviceId: string, fy: string) => `${shopId}_${deviceId}_${fy}`;

function toCommandLine(line: BillLine): SaleCommand['lines'][number] {
  if (line.kind === 'quick') {
    return {
      kind: 'quick',
      amountPaise: line.amountPaise,
      ...(line.label.trim() ? { label: line.label.trim() } : {}),
    };
  }
  return {
    kind: 'product',
    productId: line.productId,
    quantityMilli: line.quantityMilli,
    unitPricePaise: line.unitPricePaise,
    entryMode: line.entryMode,
    ...(isPriceOverride(line) ? { priceOverride: true } : {}),
    ...(line.lineDiscountPaise > 0 ? { lineDiscountPaise: line.lineDiscountPaise } : {}),
  };
}

/**
 * Saves a bill (features/billing.md, ADR-035):
 *  - the next invoice number is this phone's last number + 1;
 *  - if the server reports another number as next (e.g. the phone lost its counter), the counter is
 *    moved there first and the bill is sent once more with the same operation id;
 *  - the caller keeps `attempt` for retries, so a repeated tap or a retry after a timeout returns
 *    the bill already saved instead of creating a second one.
 */
export class CreateSale {
  constructor(
    private readonly billing: BillingRepository,
    private readonly counter: InvoiceCounterStore,
  ) {}

  async execute(input: {
    context: BillingContext;
    settings: BillingSettings;
    draft: BillDraft;
    payments: PaymentPart[];
    attempt: SaleAttempt;
    source?: SaleCommand['source'];
  }): Promise<CreatedSale> {
    const { context, settings, draft, payments, attempt } = input;
    if (draft.lines.length === 0) throw new BillInputError('EMPTY_BILL');
    if (payments.some((p) => !settings.enabledPaymentMethods.includes(p.method))) {
      throw new BillInputError('METHOD_NOT_ENABLED');
    }
    const totals = draftTotals(draft, settings);
    if (payments.reduce((sum, p) => sum + p.amountPaise, 0) !== totals.totalPaise) {
      throw new BillInputError('PAYMENTS_DO_NOT_MATCH');
    }

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
      source: input.source ?? 'keypad',
      lines: draft.lines.map(toCommandLine),
      ...(draft.billDiscountPaise > 0 ? { billDiscountPaise: draft.billDiscountPaise } : {}),
      payments,
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

export class ListSales {
  constructor(private readonly billing: BillingRepository) {}
  execute(shopId: string, filter: SaleFilter, cursor: string | null, limit = 30): Promise<SalePage> {
    return this.billing.listSales(shopId, { ...filter, query: filter.query.trim() }, cursor, limit);
  }
}

/** Voids a bill with a reason; the caller keeps the operation id for retries. Nothing is deleted. */
export class VoidSale {
  constructor(private readonly billing: BillingRepository) {}
  async execute(input: {
    shopId: string;
    saleId: string;
    reason: string;
    clientOperationId: string;
  }): Promise<Sale> {
    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 200) throw new BillInputError('REASON_REQUIRED');
    return this.billing.voidSale({ ...input, reason });
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
