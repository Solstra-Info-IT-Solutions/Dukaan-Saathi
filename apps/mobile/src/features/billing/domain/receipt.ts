import { formatPaise, paise, splitCgstSgst } from '@ds/domain-core';
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
  method: (method: string) => string;
  formatDate: (iso: string) => string;
}

export interface ReceiptLine {
  label: string;
  amount: string;
}

export interface ReceiptModel {
  shopName: string;
  shopAddress: string | null;
  shopPhone: string | null;
  invoiceNumber: string;
  date: string;
  lines: ReceiptLine[];
  totals: ReceiptLine[];
  total: string;
  payments: string[];
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
    shopName: sale.shop.name,
    shopAddress:
      [sale.shop.addressLine, sale.shop.city, sale.shop.pincode].filter(Boolean).join(', ') || null,
    shopPhone: sale.shop.phone,
    invoiceNumber: sale.invoiceNumber,
    date: labels.formatDate(sale.occurredAt),
    lines: sale.lines.map((l) => ({
      label: l.label ?? `${labels.item} ${l.lineNo}`,
      amount: money(l.grossPaise - l.lineDiscountPaise),
    })),
    totals,
    total: money(t.totalPaise),
    payments: sale.payments.map(
      (p) =>
        `${labels.method(p.method)} ${money(p.amountPaise)}` +
        (p.confirmation === 'manual' ? ` (${labels.upiConfirmedByShop})` : ''),
    ),
    footer,
  };
}

export function receiptText(r: ReceiptModel, labels: Pick<ReceiptLabels, 'bill' | 'total' | 'paid'>): string {
  return [
    `*${r.shopName}*`,
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
<h1>${escapeHtml(r.shopName)}</h1>
${r.shopAddress ? `<div class="c">${escapeHtml(r.shopAddress)}</div>` : ''}
${r.shopPhone ? `<div class="c">${escapeHtml(r.shopPhone)}</div>` : ''}
<hr><div>${escapeHtml(labels.bill)}: ${escapeHtml(r.invoiceNumber)}</div><div>${escapeHtml(r.date)}</div><hr>
<table>${r.lines.map(row).join('')}</table><hr>
<table>${r.totals.map(row).join('')}<tr class="t"><td>${escapeHtml(labels.total)}</td><td class="r">${escapeHtml(r.total)}</td></tr></table>
${r.payments.length ? `<div>${escapeHtml(labels.paid)}: ${escapeHtml(r.payments.join(', '))}</div>` : ''}
<hr>${r.footer.map((f) => `<div class="c">${escapeHtml(f)}</div>`).join('')}
</body></html>`;
}
