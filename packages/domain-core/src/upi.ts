/**
 * UPI deep link for a static QR (features/billing.md "UPI"). The shopkeeper confirms receipt by hand;
 * the app never claims the payment was verified.
 */
export function upiPaymentUri(input: {
  vpa: string;
  payeeName: string;
  amountPaise: number;
  note?: string;
}): string {
  const rupees = `${Math.floor(input.amountPaise / 100)}.${String(input.amountPaise % 100).padStart(2, '0')}`;
  const params = [
    `pa=${encodeURIComponent(input.vpa)}`,
    `pn=${encodeURIComponent(input.payeeName)}`,
    `am=${rupees}`,
    'cu=INR',
    ...(input.note ? [`tn=${encodeURIComponent(input.note)}`] : []),
  ];
  return `upi://pay?${params.join('&')}`;
}
