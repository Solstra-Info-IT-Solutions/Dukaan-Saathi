import { draftBill } from './billMath';
import type {
  BillCustomer,
  BillDraft,
  BillingContext,
  BillingSettings,
  Sale,
  SaleCommand,
} from './entities/Bill';

/** Invoice number exactly as create_sale makes it: PREFIX/FY/DEVICE-000123. */
export function invoiceNumber(prefix: string, fy: string, deviceCode: string, seq: number): string {
  return `${prefix}/${fy}/${deviceCode}-${String(seq).padStart(Math.max(6, String(seq).length), '0')}`;
}

/**
 * The receipt of a bill saved on this phone (pure), built from what was sent: same lines, totals and invoice
 * number the server will store. Shown until the server confirms the bill (OFFLINE_SYNC_DESIGN.md §3).
 */
export function offlineReceipt(input: {
  command: SaleCommand & { saleId: string };
  draft: BillDraft;
  context: BillingContext;
  settings: BillingSettings & {
    addressLine?: string | null;
    city?: string | null;
    pincode?: string | null;
    phone?: string | null;
    gstin?: string | null;
  };
  customer?: BillCustomer | null;
}): Sale {
  const { command, draft, context, settings } = input;
  const bill = draftBill(draft, settings);
  const udhaar = command.udhaarPaise ?? 0;
  return {
    saleId: command.saleId,
    shopId: command.shopId,
    invoiceNumber: invoiceNumber(
      context.invoicePrefix ?? 'DS',
      command.invoice.fy,
      context.deviceCode ?? '?',
      command.invoice.seq,
    ),
    status: 'completed',
    reviewReasons: [],
    occurredAt: command.occurredAt,
    createdAt: command.occurredAt,
    createdByName: null,
    taxMode: settings.taxMode,
    totals: command.clientTotals,
    billDiscountPaise: draft.billDiscountPaise,
    paidPaise: bill.totalPaise - udhaar,
    udhaarPaise: udhaar,
    note: null,
    voidedAt: null,
    voidReason: null,
    lines: draft.lines.map((l, i) => {
      const r = bill.lines[i]!;
      return {
        lineNo: i + 1,
        kind: l.kind,
        productId: l.kind === 'product' ? l.productId : null,
        label: l.kind === 'product' ? l.name : l.label.trim() || null,
        unitCode: l.kind === 'product' ? l.unitCode : null,
        quantityMilli: l.kind === 'product' ? l.quantityMilli : 1000,
        unitPricePaise: l.kind === 'product' ? l.unitPricePaise : l.amountPaise,
        grossPaise: r.grossPaise,
        lineDiscountPaise: r.lineDiscountPaise,
        billDiscountSharePaise: r.billDiscountSharePaise,
        netPaise: r.netPaise,
        taxRateBp: l.kind === 'product' ? l.taxRateBp : 0,
        taxPaise: r.taxPaise,
      };
    }),
    payments: command.payments.map((p) => ({
      method: p.method,
      amountPaise: p.amountPaise,
      reference: null,
      confirmation: p.method === 'upi' ? ('manual' as const) : null,
    })),
    customer: input.customer
      ? {
          id: input.customer.id,
          name: input.customer.name,
          phone: input.customer.phone,
          balancePaise: input.customer.balancePaise + udhaar,
        }
      : null,
    shop: {
      name: context.shopName,
      addressLine: settings.addressLine ?? null,
      city: settings.city ?? null,
      pincode: settings.pincode ?? null,
      phone: settings.phone ?? null,
      gstin: settings.gstin ?? null,
      upiVpa: settings.upiVpa,
    },
    local: { state: 'pending', code: null },
  };
}
