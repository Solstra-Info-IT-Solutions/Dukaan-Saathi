import { formatPaise, formatQuantity, paise, quantityMilli, splitCgstSgst } from '@ds/domain-core';
import type { Sale } from './entities/Bill';

/**
 * Receipt builders (pure): a sale → WhatsApp text and printable HTML. Labels come from the
 * presentation layer so the same code serves English and Hindi.
 */
export interface ReceiptLabels {
  bill: string;
  subtotal: string;
  discount: string;
  roundOff: string;
  total: string;
  paid: string;
  cgst: string;
  sgst: string;
  gstin: string;
  billOfSupply: string;
  item: string;
  thanks: string;
  upiConfirmedByShop: string;
  taxInvoice: string;
  hsn: string;
  voided: string;
  returned: string;
  /** Phase 08: "On udhaar" and "Customer". */
  onUdhaar?: string;
  customer?: string;
  method: (method: string) => string;
  unit: (code: string) => string;
  formatDate: (iso: string) => string;
}

export interface ReceiptLine {
  label: string;
  amount: string;
}

export interface ReceiptModel {
  /** "Tax invoice" for GST-registered shops. */
  title: string | null;
  /** "VOIDED: reason" for a voided bill. */
  voided: string | null;
  shopName: string;
  shopAddress: string | null;
  shopPhone: string | null;
  invoiceNumber: string;
  date: string;
  lines: ReceiptLine[];
  totals: ReceiptLine[];
  total: string;
  payments: string[];
  /** "On udhaar ₹300.00" for credit bills. */
  udhaar: string | null;
  /** "Customer: Ramesh". */
  customer: string | null;
  /** "Returned ₹45.00 (Cash): reason" per return. */
  returns: string[];
  footer: string[];
}

const money = (value: number) => formatPaise(paise(value));

export function buildReceipt(sale: Sale, labels: ReceiptLabels): ReceiptModel {
  const t = sale.totals;
  const totals: ReceiptLine[] = [{ label: labels.subtotal, amount: money(t.subtotalPaise) }];
  if (t.discountPaise > 0) totals.push({ label: labels.discount, amount: `-${money(t.discountPaise)}` });
  if (t.roundOffPaise !== 0) totals.push({ label: labels.roundOff, amount: money(t.roundOffPaise) });
  if (sale.taxMode === 'gst_regular' && t.taxPaise > 0) {
    const { cgstPaise, sgstPaise } = splitCgstSgst(paise(t.taxPaise));
    totals.push(
      { label: labels.cgst, amount: money(cgstPaise) },
      { label: labels.sgst, amount: money(sgstPaise) },
    );
  }

  const footer: string[] = [];
  if (sale.shop.gstin) footer.push(`${labels.gstin}: ${sale.shop.gstin}`);
  if (sale.taxMode === 'gst_composition') footer.push(labels.billOfSupply);
  footer.push(labels.thanks);

  return {
    title: sale.taxMode === 'gst_regular' ? labels.taxInvoice : null,
    voided: sale.status === 'voided' ? `${labels.voided}: ${sale.voidReason ?? ''}`.trim() : null,
    shopName: sale.shop.name,
    shopAddress:
      [sale.shop.addressLine, sale.shop.city, sale.shop.pincode].filter(Boolean).join(', ') || null,
    shopPhone: sale.shop.phone,
    invoiceNumber: sale.invoiceNumber,
    date: labels.formatDate(sale.occurredAt),
    lines: sale.lines.map((l) => {
      const name = l.label ?? `${labels.item} ${l.lineNo}`;
      const detail =
        l.kind === 'product'
          ? ` (${formatQuantity(quantityMilli(l.quantityMilli))} ${labels.unit(l.unitCode ?? '')} × ${money(l.unitPricePaise)})`
          : '';
      const hsn = sale.taxMode === 'gst_regular' && l.hsnCode ? ` ${labels.hsn} ${l.hsnCode}` : '';
      return { label: `${name}${detail}${hsn}`, amount: money(l.grossPaise - l.lineDiscountPaise) };
    }),
    totals,
    total: money(t.totalPaise),
    payments: sale.payments.map(
      (p) =>
        `${labels.method(p.method)} ${money(p.amountPaise)}` +
        (p.confirmation === 'manual' ? ` (${labels.upiConfirmedByShop})` : ''),
    ),
    udhaar: sale.udhaarPaise > 0 ? `${labels.onUdhaar ?? 'Udhaar'} ${money(sale.udhaarPaise)}` : null,
    customer: sale.customer ? `${labels.customer ?? 'Customer'}: ${sale.customer.name}` : null,
    returns: (sale.returns ?? []).map(
      (r) => `${labels.returned} ${money(r.refundPaise)} (${labels.method(r.refundMethod)}): ${r.reason}`,
    ),
    footer,
  };
}

export function receiptText(r: ReceiptModel, labels: Pick<ReceiptLabels, 'bill' | 'total' | 'paid'>): string {
  return [
    ...(r.voided ? [`*${r.voided}*`] : []),
    `*${r.shopName}*`,
    ...(r.title ? [r.title] : []),
    ...(r.shopAddress ? [r.shopAddress] : []),
    ...(r.shopPhone ? [r.shopPhone] : []),
    `${labels.bill}: ${r.invoiceNumber}`,
    r.date,
    '------------------------',
    ...r.lines.map((l) => `${l.label}  ${l.amount}`),
    '------------------------',
    ...r.totals.map((l) => `${l.label}: ${l.amount}`),
    `*${labels.total}: ${r.total}*`,
    ...(r.payments.length ? [`${labels.paid}: ${r.payments.join(', ')}`] : []),
    ...(r.udhaar ? [r.udhaar] : []),
    ...(r.customer ? [r.customer] : []),
    ...r.returns,
    '',
    ...r.footer,
  ].join('\n');
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 58/80 mm-friendly HTML for expo-print. All shop and line text is escaped. */
export function receiptHtml(r: ReceiptModel, labels: Pick<ReceiptLabels, 'bill' | 'total' | 'paid'>): string {
  const row = (l: ReceiptLine) =>
    `<tr><td>${escapeHtml(l.label)}</td><td class="r">${escapeHtml(l.amount)}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>body{font-family:sans-serif;max-width:320px;margin:0 auto;padding:12px;font-size:13px}h1{font-size:17px;margin:0;text-align:center}
.c{text-align:center}table{width:100%;border-collapse:collapse}td{padding:2px 0}.r{text-align:right}
hr{border:none;border-top:1px dashed #000}.t td{font-weight:bold;font-size:15px}</style></head><body>
${r.voided ? `<div class="c"><b>${escapeHtml(r.voided)}</b></div>` : ''}
<h1>${escapeHtml(r.shopName)}</h1>
${r.title ? `<div class="c">${escapeHtml(r.title)}</div>` : ''}
${r.shopAddress ? `<div class="c">${escapeHtml(r.shopAddress)}</div>` : ''}
${r.shopPhone ? `<div class="c">${escapeHtml(r.shopPhone)}</div>` : ''}
<hr><div>${escapeHtml(labels.bill)}: ${escapeHtml(r.invoiceNumber)}</div><div>${escapeHtml(r.date)}</div><hr>
<table>${r.lines.map(row).join('')}</table><hr>
<table>${r.totals.map(row).join('')}<tr class="t"><td>${escapeHtml(labels.total)}</td><td class="r">${escapeHtml(r.total)}</td></tr></table>
${r.payments.length ? `<div>${escapeHtml(labels.paid)}: ${escapeHtml(r.payments.join(', '))}</div>` : ''}
${r.udhaar ? `<div>${escapeHtml(r.udhaar)}</div>` : ''}${r.customer ? `<div>${escapeHtml(r.customer)}</div>` : ''}
${r.returns.map((x) => `<div>${escapeHtml(x)}</div>`).join('')}
<hr>${r.footer.map((f) => `<div class="c">${escapeHtml(f)}</div>`).join('')}
</body></html>`;
}
