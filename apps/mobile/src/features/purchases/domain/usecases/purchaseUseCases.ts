import { normalizeIndianPhone } from '@ds/contracts';
import { paise, parseQuantity, parseRupeesToPaise, quantityMilli, lineGross } from '@ds/domain-core';
import type {
  CatalogueProduct,
  CatalogueReference,
  PaymentMethod,
  PurchaseLineDraft,
  PurchaseResult,
  Supplier,
  SupplierLedgerEntry,
} from '../entities/Purchases';
import type { PurchaseRepository } from '../repositories/PurchaseRepository';

export class PurchaseInputError extends Error {
  constructor(
    readonly reason:
      | 'NAME_REQUIRED'
      | 'INVALID_PHONE'
      | 'INVALID_AMOUNT'
      | 'NO_LINES'
      | 'INVALID_LINE'
      | 'PAID_MORE_THAN_TOTAL'
      | 'UNPAID_NEEDS_SUPPLIER',
    readonly lineKey?: string,
  ) {
    super(reason);
    this.name = 'PurchaseInputError';
  }
}

/** A catalogue product as a purchase line (1 unit, last cost if known). */
export function purchaseLine(
  product: CatalogueProduct,
  reference: CatalogueReference,
  key: string,
): PurchaseLineDraft {
  const unit = reference.units.find((u) => u.code === product.unitCode);
  const cost = product.lastCostPaise ?? null;
  return {
    key,
    productId: product.id,
    name: product.name,
    unitCode: product.unitCode,
    allowsFraction: unit?.allowsFraction ?? false,
    quantityText: '1',
    costText: cost === null ? '' : (cost / 100).toFixed(2).replace(/\.00$/, ''),
    newPriceText: '',
    currentPricePaise: product.pricePaise,
  };
}

interface ParsedLine {
  key: string;
  productId: string;
  quantityMilli: number;
  unitCostPaise: number;
  amountPaise: number;
  newPricePaise: number | null;
}

/** Parses the typed lines; amount = round(cost × qty), the same rule receive_purchase uses. */
export function parsePurchaseLines(lines: readonly PurchaseLineDraft[]): ParsedLine[] {
  return lines.map((l) => {
    const q = parseQuantity(l.quantityText);
    const cost = parseRupeesToPaise(l.costText);
    const price = l.newPriceText.trim() ? parseRupeesToPaise(l.newPriceText) : null;
    if (q === null || q < 1 || (!l.allowsFraction && q % 1000 !== 0) || cost === null) {
      throw new PurchaseInputError('INVALID_LINE', l.key);
    }
    if (l.newPriceText.trim() && price === null) throw new PurchaseInputError('INVALID_LINE', l.key);
    return {
      key: l.key,
      productId: l.productId,
      quantityMilli: q,
      unitCostPaise: cost,
      amountPaise: lineGross(paise(cost), quantityMilli(q)),
      newPricePaise: price,
    };
  });
}

/** Total of the lines that parse; invalid lines count as 0 while the user is typing. */
export function purchaseTotal(lines: readonly PurchaseLineDraft[]): number {
  return lines.reduce((sum, l) => {
    try {
      return sum + (parsePurchaseLines([l])[0]?.amountPaise ?? 0);
    } catch {
      return sum;
    }
  }, 0);
}

export class ListSuppliers {
  constructor(private readonly purchases: PurchaseRepository) {}
  execute(shopId: string): Promise<Supplier[]> {
    return this.purchases.listSuppliers(shopId);
  }
}

export class SaveSupplier {
  constructor(private readonly purchases: PurchaseRepository) {}
  async execute(input: {
    id: string;
    shopId: string;
    name: string;
    phoneText: string;
    openingText: string;
    note: string;
  }): Promise<Supplier> {
    if (!input.name.trim()) throw new PurchaseInputError('NAME_REQUIRED');
    const phone = input.phoneText.trim() ? normalizeIndianPhone(input.phoneText) : null;
    if (input.phoneText.trim() && !phone) throw new PurchaseInputError('INVALID_PHONE');
    const opening = input.openingText.trim() ? parseRupeesToPaise(input.openingText) : 0;
    if (opening === null) throw new PurchaseInputError('INVALID_AMOUNT');
    return this.purchases.saveSupplier({
      id: input.id,
      shopId: input.shopId,
      name: input.name.trim(),
      ...(phone ? { phone } : {}),
      ...(input.note.trim() ? { note: input.note.trim() } : {}),
      ...(opening ? { openingBalancePaise: opening } : {}),
    });
  }
}

export class GetSupplierLedger {
  constructor(private readonly purchases: PurchaseRepository) {}
  execute(shopId: string, supplierId: string): Promise<SupplierLedgerEntry[]> {
    return this.purchases.ledger(shopId, supplierId);
  }
}

/**
 * Receives goods: stock up for tracked items, cost price updated, optional new selling prices, supplier balance
 * up by the total and down by what is paid now. Without a supplier the purchase must be paid in full.
 */
export class ReceivePurchase {
  constructor(private readonly purchases: PurchaseRepository) {}
  async execute(input: {
    clientOperationId: string;
    shopId: string;
    deviceId: string;
    supplierId: string | null;
    invoiceNo: string;
    lines: readonly PurchaseLineDraft[];
    paidText: string;
    method: PaymentMethod;
  }): Promise<PurchaseResult> {
    if (input.lines.length === 0) throw new PurchaseInputError('NO_LINES');
    const parsed = parsePurchaseLines(input.lines);
    const total = parsed.reduce((s, l) => s + l.amountPaise, 0);
    const paid = input.paidText.trim() ? parseRupeesToPaise(input.paidText) : input.supplierId ? 0 : total;
    if (paid === null) throw new PurchaseInputError('INVALID_AMOUNT');
    if (paid > total) throw new PurchaseInputError('PAID_MORE_THAN_TOTAL');
    if (!input.supplierId && paid !== total) throw new PurchaseInputError('UNPAID_NEEDS_SUPPLIER');
    const priceUpdates = parsed
      .filter((l) => l.newPricePaise !== null)
      .map((l) => ({ productId: l.productId, pricePaise: l.newPricePaise! }));
    return this.purchases.receivePurchase({
      clientOperationId: input.clientOperationId,
      shopId: input.shopId,
      deviceId: input.deviceId,
      ...(input.supplierId ? { supplierId: input.supplierId } : {}),
      ...(input.invoiceNo.trim() ? { supplierInvoiceNo: input.invoiceNo.trim() } : {}),
      lines: parsed.map((l) => ({
        productId: l.productId,
        quantityMilli: l.quantityMilli,
        unitCostPaise: l.unitCostPaise,
      })),
      payments: paid > 0 ? [{ method: input.method, amountPaise: paid }] : [],
      ...(priceUpdates.length ? { priceUpdates } : {}),
    });
  }
}

export class RecordSupplierPayment {
  constructor(private readonly purchases: PurchaseRepository) {}
  async execute(input: {
    clientOperationId: string;
    shopId: string;
    deviceId: string;
    supplierId: string;
    amountText: string;
    method: PaymentMethod;
    note: string;
  }): Promise<{ balancePaise: number }> {
    const amount = parseRupeesToPaise(input.amountText);
    if (amount === null || amount < 1) throw new PurchaseInputError('INVALID_AMOUNT');
    return this.purchases.paySupplier({
      clientOperationId: input.clientOperationId,
      shopId: input.shopId,
      deviceId: input.deviceId,
      supplierId: input.supplierId,
      amountPaise: amount,
      method: input.method,
      ...(input.note.trim() ? { note: input.note.trim() } : {}),
    });
  }
}
