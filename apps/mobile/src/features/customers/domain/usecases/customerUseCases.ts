import { normalizeIndianPhone } from '@ds/contracts';
import { formatPaise, paise, parseRupeesToPaise, upiPaymentUri } from '@ds/domain-core';
import type {
  Customer,
  CustomerLedger,
  CustomerList,
  CustomerQuery,
  RepaymentMethod,
} from '../entities/Customers';
import type { CustomerRepository } from '../repositories/CustomerRepository';

export class CustomerInputError extends Error {
  constructor(readonly reason: 'NAME_REQUIRED' | 'INVALID_PHONE' | 'INVALID_AMOUNT' | 'REASON_REQUIRED') {
    super(reason);
    this.name = 'CustomerInputError';
  }
}

export class ListCustomers {
  constructor(private readonly customers: CustomerRepository) {}
  execute(shopId: string, query: CustomerQuery): Promise<CustomerList> {
    return this.customers.list(shopId, { ...query, query: query.query.trim() });
  }
}

/**
 * Creates or edits a customer. Opening balance (udhaar already owed, or an advance with "-") and credit
 * limit are optional; empty text leaves them out. The opening balance only counts when the customer is created.
 */
export class SaveCustomer {
  constructor(private readonly customers: CustomerRepository) {}
  async execute(input: {
    id: string;
    shopId: string;
    name: string;
    phoneText: string;
    note?: string;
    openingText?: string;
    creditLimitText?: string;
  }): Promise<Customer> {
    if (!input.name.trim()) throw new CustomerInputError('NAME_REQUIRED');
    const phone = input.phoneText.trim() ? normalizeIndianPhone(input.phoneText) : null;
    if (input.phoneText.trim() && !phone) throw new CustomerInputError('INVALID_PHONE');
    const openingRaw = (input.openingText ?? '').trim();
    const advance = openingRaw.startsWith('-');
    const openingAbs = openingRaw ? parseRupeesToPaise(openingRaw.replace(/^-/, '')) : 0;
    if (openingAbs === null) throw new CustomerInputError('INVALID_AMOUNT');
    const limitRaw = (input.creditLimitText ?? '').trim();
    const limit = limitRaw ? parseRupeesToPaise(limitRaw) : null;
    if (limitRaw && limit === null) throw new CustomerInputError('INVALID_AMOUNT');
    const opening = advance ? -openingAbs : openingAbs;
    return this.customers.save({
      id: input.id,
      shopId: input.shopId,
      name: input.name.trim(),
      ...(phone ? { phone } : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      ...(opening ? { openingBalancePaise: opening } : {}),
      ...(limit !== null ? { creditLimitPaise: limit } : {}),
    });
  }
}

export class GetCustomerLedger {
  constructor(private readonly customers: CustomerRepository) {}
  execute(shopId: string, customerId: string): Promise<CustomerLedger> {
    return this.customers.ledger(shopId, customerId);
  }
}

/** Money received against udhaar. Paying more than owed is allowed and becomes an advance. */
export class RecordRepayment {
  constructor(private readonly customers: CustomerRepository) {}
  async execute(input: {
    clientOperationId: string;
    shopId: string;
    deviceId: string;
    customerId: string;
    amountText: string;
    method: RepaymentMethod;
    note: string;
  }): Promise<{ balancePaise: number }> {
    const amount = parseRupeesToPaise(input.amountText);
    if (amount === null || amount < 1) throw new CustomerInputError('INVALID_AMOUNT');
    return this.customers.recordRepayment({
      clientOperationId: input.clientOperationId,
      shopId: input.shopId,
      deviceId: input.deviceId,
      customerId: input.customerId,
      amountPaise: amount,
      method: input.method,
      ...(input.note.trim() ? { note: input.note.trim() } : {}),
    });
  }
}

/** Owner correction: "add" raises what is owed, "reduce" lowers it. A reason is required. */
export class AdjustBalance {
  constructor(private readonly customers: CustomerRepository) {}
  async execute(input: {
    clientOperationId: string;
    shopId: string;
    customerId: string;
    direction: 'add' | 'reduce';
    amountText: string;
    reason: string;
  }): Promise<{ balancePaise: number }> {
    const amount = parseRupeesToPaise(input.amountText);
    if (amount === null || amount < 1) throw new CustomerInputError('INVALID_AMOUNT');
    if (input.reason.trim().length < 3) throw new CustomerInputError('REASON_REQUIRED');
    return this.customers.adjustBalance({
      clientOperationId: input.clientOperationId,
      shopId: input.shopId,
      customerId: input.customerId,
      amountPaise: input.direction === 'add' ? amount : -amount,
      reason: input.reason.trim(),
    });
  }
}

/**
 * WhatsApp reminder text in the customer's language, with the amount and (when the shop has a UPI id)
 * a UPI payment link. Pure: nothing is sent; the shopkeeper sends it from WhatsApp.
 */
export function buildReminderMessage(input: {
  language: 'en' | 'hi';
  customerName: string;
  shopName: string;
  balancePaise: number;
  upiVpa: string | null;
}): string {
  const amount = formatPaise(paise(input.balancePaise));
  const upi = input.upiVpa
    ? upiPaymentUri({
        vpa: input.upiVpa,
        payeeName: input.shopName,
        amountPaise: input.balancePaise,
        note: input.language === 'hi' ? 'उधार भुगतान' : 'Udhaar payment',
      })
    : null;
  if (input.language === 'hi') {
    return [
      `नमस्ते ${input.customerName} जी,`,
      `${input.shopName} पर आपका उधार ${amount} बाकी है। कृपया सुविधा अनुसार भुगतान करें।`,
      ...(upi ? [`UPI से भुगतान: ${upi}`] : []),
      'धन्यवाद!',
    ].join('\n');
  }
  return [
    `Namaste ${input.customerName},`,
    `Your udhaar at ${input.shopName} is ${amount}. Please pay when convenient.`,
    ...(upi ? [`Pay by UPI: ${upi}`] : []),
    'Thank you!',
  ].join('\n');
}

/** WhatsApp link with the message filled in; without a phone number WhatsApp asks whom to send it to. */
export function whatsappUrl(phoneE164: string | null, message: string): string {
  const to = phoneE164 ? phoneE164.replace(/^\+/, '') : '';
  return `https://wa.me/${to}?text=${encodeURIComponent(message)}`;
}
