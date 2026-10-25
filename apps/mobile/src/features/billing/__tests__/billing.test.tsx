import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AppError } from '@/core/errors/AppError';
import { baseSettings, SHOP_A } from '../../../../tests/fakes/shops';
import { renderHookWithQuery, renderWithProviders } from '../../../../tests/renderWithProviders';
import {
  changeDue,
  discountLimitBp,
  draftTotals,
  keypadToPaise,
  pressKeypad,
  upiPaymentUri,
} from '../domain/billMath';
import {
  type BillingContext,
  type CreatedSale,
  type InvoiceCounterStore,
  InvoiceSequenceConflict,
  type ReceiptSharer,
  type Sale,
  type SaleCommand,
} from '../domain/entities/Bill';
import { buildReceipt, type ReceiptLabels, receiptHtml, receiptText } from '../domain/receipt';
import type { BillingRepository } from '../domain/repositories/BillingRepository';
import { BillInputError, CreateQuickSale, GetSale, ShareReceipt } from '../domain/usecases/billingUseCases';
import { BillingScreen } from '../presentation/screens/BillingScreen';
import { ReceiptScreen } from '../presentation/screens/ReceiptScreen';
import { useBillingViewModel } from '../presentation/viewmodels/useBillingViewModel';

const DEVICE = '0190f0f0-0000-7000-8000-0000000000d1';
const NOW = '2026-10-25T05:30:00.000Z'; // FY 2627

/** Simulates create_sale: invoice sequence per series, idempotent replays, optional lost response. */
class FakeBillingRepository implements BillingRepository {
  lastSeq = 0;
  calls: SaleCommand[] = [];
  saved = new Map<string, { payload: string; result: CreatedSale }>();
  sales = new Map<string, Sale>();
  /** Saves the bill, then throws (a response lost to a timeout). */
  loseNextResponse = false;
  failNext: unknown = null;

  async createSale(command: SaleCommand): Promise<CreatedSale> {
    this.calls.push(command);
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
    const payload = JSON.stringify(command);
    const previous = this.saved.get(command.clientOperationId);
    if (previous) {
      if (previous.payload !== payload) throw new AppError('DS_IDEMPOTENCY_CONFLICT');
      return { ...previous.result, replayed: true };
    }
    if (command.invoice.seq !== this.lastSeq + 1) throw new InvoiceSequenceConflict(this.lastSeq + 1);
    this.lastSeq = command.invoice.seq;
    const saleId = `0190f0f0-0000-7000-8000-${String(this.saved.size + 1).padStart(12, '0')}`;
    const result: CreatedSale = {
      saleId,
      invoiceNumber: `DS/${command.invoice.fy}/A-${String(command.invoice.seq).padStart(6, '0')}`,
      seq: command.invoice.seq,
      status: 'completed',
      reviewReasons: [],
      totals: command.clientTotals,
      replayed: false,
    };
    this.saved.set(command.clientOperationId, { payload, result });
    if (this.loseNextResponse) {
      this.loseNextResponse = false;
      throw new AppError('NETWORK_TIMEOUT');
    }
    return result;
  }

  async getSale(_shopId: string, saleId: string): Promise<Sale> {
    const sale = this.sales.get(saleId);
    if (!sale) throw new AppError('DS_NOT_FOUND');
    return sale;
  }
}

class MemoryCounter implements InvoiceCounterStore {
  values = new Map<string, number>();
  async last(key: string) {
    return this.values.get(key) ?? null;
  }
  async save(key: string, seq: number) {
    this.values.set(key, seq);
  }
}

const context = (over: Partial<BillingContext> = {}): BillingContext => ({
  shopId: SHOP_A,
  shopName: 'Sharma Kirana',
  role: 'owner',
  canDiscount: true,
  deviceId: DEVICE,
  fy: '2627',
  lastSeq: 0,
  ...over,
});

let idCounter = 0;
const newId = () => `0190f0f0-0000-7000-8000-${String(++idCounter).padStart(12, '0')}`;

function setup(settings = baseSettings) {
  const repo = new FakeBillingRepository();
  const counter = new MemoryCounter();
  const deps = {
    getSettings: { execute: async () => settings },
    createSale: new CreateQuickSale(repo, counter),
    newId,
    now: () => new Date(NOW),
  };
  return { repo, counter, deps };
}

const draft = (...amounts: number[]) => ({
  lines: amounts.map((a, i) => ({ key: String(i), label: '', amountPaise: a })),
  billDiscountPaise: 0,
});
const attempt = (opId = newId()) => ({ clientOperationId: opId, occurredAt: NOW });

describe('bill maths', () => {
  it('keypad builds rupee amounts and refuses invalid input', () => {
    const typed = (keys: string[]) => keys.reduce((e, k) => pressKeypad(e, k as never), '');
    expect(typed(['4', '0'])).toBe('40');
    expect(typed(['0', '0', '5'])).toBe('5');
    expect(typed(['.', '5'])).toBe('0.5');
    expect(typed(['1', '.', '2', '5', '9'])).toBe('1.25');
    expect(typed(['1', '.', '.', '5'])).toBe('1.5');
    expect(typed(['1', '2', 'back'])).toBe('1');
    expect(keypadToPaise('40')).toBe(4000);
    expect(keypadToPaise('0.5')).toBe(50);
    expect(keypadToPaise('0')).toBeNull();
    expect(keypadToPaise('')).toBeNull();
  });

  it('totals match the server rule, including round-off', () => {
    expect(
      draftTotals(
        { ...draft(1250, 4099, 2000), billDiscountPaise: 300 },
        { taxMode: 'none', roundOffEnabled: true },
      ),
    ).toEqual({ subtotalPaise: 7349, discountPaise: 300, taxPaise: 0, roundOffPaise: -49, totalPaise: 7000 });
  });

  it('discount limits by role, change and UPI link', () => {
    expect(discountLimitBp('owner', baseSettings)).toBe(10000);
    expect(discountLimitBp('manager', baseSettings)).toBe(1000);
    expect(discountLimitBp('cashier', baseSettings)).toBe(0);
    expect(changeDue(10000, 7500)).toBe(2500);
    expect(changeDue(5000, 7500)).toBeNull();
    expect(upiPaymentUri({ vpa: 'sharma@okaxis', payeeName: 'Sharma Kirana', amountPaise: 7505 })).toBe(
      'upi://pay?pa=sharma%40okaxis&pn=Sharma%20Kirana&am=75.05&cu=INR',
    );
  });
});

describe('CreateQuickSale', () => {
  it('numbers bills from the device series and remembers the last number', async () => {
    const { repo, counter, deps } = setup();
    repo.lastSeq = 4;
    const ctx = context({ lastSeq: 4 });
    const first = await deps.createSale.execute({
      context: ctx,
      settings: baseSettings,
      draft: draft(5000),
      method: 'cash',
      attempt: attempt(),
    });
    expect(first.invoiceNumber).toBe('DS/2627/A-000005');
    const second = await deps.createSale.execute({
      context: ctx,
      settings: baseSettings,
      draft: draft(100),
      method: 'upi',
      attempt: attempt(),
    });
    expect(second.seq).toBe(6);
    expect([...counter.values.values()]).toEqual([6]);
    expect(repo.calls[1]?.payments).toEqual([{ method: 'upi', amountPaise: 100 }]);
  });

  it('moves to the number the server expects and resends the same operation', async () => {
    const { repo, deps } = setup();
    repo.lastSeq = 9; // the phone lost its counter
    const a = attempt();
    const created = await deps.createSale.execute({
      context: context(),
      settings: baseSettings,
      draft: draft(5000),
      method: 'cash',
      attempt: a,
    });
    expect(created.seq).toBe(10);
    expect(repo.calls.map((c) => [c.invoice.seq, c.clientOperationId])).toEqual([
      [1, a.clientOperationId],
      [10, a.clientOperationId],
    ]);
  });

  it('a retry after a lost response returns the saved bill instead of a second one', async () => {
    const { repo, deps } = setup();
    repo.loseNextResponse = true;
    const a = attempt();
    const input = {
      context: context(),
      settings: baseSettings,
      draft: draft(5000),
      method: 'cash' as const,
      attempt: a,
    };
    await expect(deps.createSale.execute(input)).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });
    const retried = await deps.createSale.execute(input);
    expect(retried.replayed).toBe(true);
    expect(repo.saved.size).toBe(1);
  });

  it('refuses empty bills and disabled payment methods', async () => {
    const { deps } = setup();
    await expect(
      deps.createSale.execute({
        context: context(),
        settings: baseSettings,
        draft: draft(),
        method: 'cash',
        attempt: attempt(),
      }),
    ).rejects.toBeInstanceOf(BillInputError);
    await expect(
      deps.createSale.execute({
        context: context(),
        settings: baseSettings,
        draft: draft(100),
        method: 'card',
        attempt: attempt(),
      }),
    ).rejects.toMatchObject({ reason: 'METHOD_NOT_ENABLED' });
  });
});

const SALE: Sale = {
  saleId: '0190f0f0-0000-7000-8000-000000000101',
  shopId: SHOP_A,
  invoiceNumber: 'DS/2627/A-000007',
  status: 'completed',
  reviewReasons: [],
  occurredAt: NOW,
  createdAt: NOW,
  createdByName: null,
  taxMode: 'none',
  totals: { subtotalPaise: 7500, discountPaise: 500, taxPaise: 0, roundOffPaise: 0, totalPaise: 7000 },
  billDiscountPaise: 500,
  paidPaise: 7000,
  udhaarPaise: 0,
  note: null,
  voidedAt: null,
  voidReason: null,
  lines: [
    {
      lineNo: 1,
      kind: 'quick',
      productId: null,
      label: 'Doodh <b>',
      unitCode: null,
      quantityMilli: 1000,
      unitPricePaise: 5000,
      grossPaise: 5000,
      lineDiscountPaise: 0,
      billDiscountSharePaise: 333,
      netPaise: 4667,
      taxRateBp: 0,
      taxPaise: 0,
    },
    {
      lineNo: 2,
      kind: 'quick',
      productId: null,
      label: null,
      unitCode: null,
      quantityMilli: 1000,
      unitPricePaise: 2500,
      grossPaise: 2500,
      lineDiscountPaise: 0,
      billDiscountSharePaise: 167,
      netPaise: 2333,
      taxRateBp: 0,
      taxPaise: 0,
    },
  ],
  payments: [{ method: 'upi', amountPaise: 7000, reference: null, confirmation: 'manual' }],
  shop: {
    name: 'Sharma Kirana',
    addressLine: 'Main Bazaar',
    city: 'Ajmer',
    pincode: null,
    phone: null,
    gstin: null,
    upiVpa: null,
  },
};

const LABELS: ReceiptLabels = {
  bill: 'Bill',
  subtotal: 'Subtotal',
  discount: 'Discount',
  roundOff: 'Round off',
  total: 'Total',
  paid: 'Paid',
  cgst: 'CGST',
  sgst: 'SGST',
  gstin: 'GSTIN',
  billOfSupply: 'Bill of supply',
  item: 'Item',
  thanks: 'Thank you',
  upiConfirmedByShop: 'confirmed by shop',
  method: (m) => m.toUpperCase(),
  formatDate: () => '25 Oct 2026, 11:00 am',
};

describe('receipt', () => {
  it('builds WhatsApp text with lines, discount, total and a manual UPI note', () => {
    const text = receiptText(buildReceipt(SALE, LABELS), LABELS);
    expect(text).toContain('*Sharma Kirana*');
    expect(text).toContain('Main Bazaar, Ajmer');
    expect(text).toContain('Bill: DS/2627/A-000007');
    expect(text).toContain('Item 2  ₹25.00');
    expect(text).toContain('Discount: -₹5.00');
    expect(text).toContain('*Total: ₹70.00*');
    expect(text).toContain('UPI ₹70.00 (confirmed by shop)');
  });

  it('escapes shop and line text in the PDF HTML', () => {
    const html = receiptHtml(buildReceipt(SALE, LABELS), LABELS);
    expect(html).toContain('Doodh &lt;b&gt;');
    expect(html).not.toContain('Doodh <b>');
  });

  it('splits GST into CGST and SGST for registered shops', () => {
    const gst = { ...SALE, taxMode: 'gst_regular' as const, totals: { ...SALE.totals, taxPaise: 1069 } };
    const r = buildReceipt(gst, LABELS);
    expect(r.totals.filter((t) => t.label === 'CGST' || t.label === 'SGST').map((t) => t.amount)).toEqual([
      '₹5.35',
      '₹5.34',
    ]);
  });
});

describe('useBillingViewModel', () => {
  it('a double tap on save sends one request and completes once', async () => {
    const { repo, deps } = setup();
    const onCompleted = jest.fn();
    const { result } = await renderHookWithQuery(() => useBillingViewModel(deps, context(), onCompleted));
    await waitFor(() => expect(result.current.state.loading).toBe(false));
    await act(async () => {
      result.current.actions.press('5');
      result.current.actions.press('0');
    });
    await act(async () => result.current.actions.openPayment());
    await act(async () => {
      await Promise.all([result.current.actions.submit(), result.current.actions.submit()]);
    });
    expect(repo.calls).toHaveLength(1);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(result.current.state.lines).toEqual([]);
  });

  it('retries with the same operation id, and a changed bill gets a new one', async () => {
    const { repo, deps } = setup();
    const { result } = await renderHookWithQuery(() => useBillingViewModel(deps, context(), jest.fn()));
    await waitFor(() => expect(result.current.state.loading).toBe(false));
    await act(async () => result.current.actions.press('9'));
    await act(async () => result.current.actions.openPayment());
    repo.failNext = new AppError('NETWORK_OFFLINE');
    await act(async () => result.current.actions.submit());
    expect(result.current.state.errorKey).toBe('errors.NETWORK_OFFLINE');
    repo.failNext = new AppError('NETWORK_OFFLINE');
    await act(async () => result.current.actions.submit());
    expect(repo.calls[0]?.clientOperationId).toBe(repo.calls[1]?.clientOperationId);
    await act(async () => result.current.actions.selectMethod('upi'));
    await act(async () => result.current.actions.submit());
    expect(repo.calls[2]?.clientOperationId).not.toBe(repo.calls[0]?.clientOperationId);
    expect(repo.saved.size).toBe(1);
  });

  it('refuses a discount above the role limit', async () => {
    const { repo, deps } = setup();
    const { result } = await renderHookWithQuery(() =>
      useBillingViewModel(deps, context({ role: 'manager' }), jest.fn()),
    );
    await waitFor(() => expect(result.current.state.loading).toBe(false));
    await act(async () => {
      result.current.actions.press('1');
      result.current.actions.press('0');
      result.current.actions.press('0');
    });
    await act(async () => result.current.actions.addLine());
    await act(async () => result.current.actions.changeDiscount('20'));
    await act(async () => result.current.actions.openPayment());
    expect(result.current.state.errorKey).toBe('billing.errors.DISCOUNT_LIMIT');
    expect(result.current.state.errorParams).toEqual({ max: 10 });
    expect(result.current.state.phase).toBe('editing');
    expect(repo.calls).toHaveLength(0);
  });
});

describe('BillingScreen', () => {
  it('amount → Pay → Cash received saves the bill', async () => {
    const { repo, deps } = setup();
    const onCompleted = jest.fn();
    await renderWithProviders(<BillingScreen deps={deps} context={context()} onCompleted={onCompleted} />);
    await fireEvent.press(await screen.findByText('5'));
    await fireEvent.press(screen.getByText('0'));
    await fireEvent.press(screen.getByText('Pay'));
    await fireEvent.changeText(await screen.findByLabelText('Cash received from customer (₹)'), '100');
    expect(await screen.findByText('Give back ₹50.00')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cash received – save bill'));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledWith(expect.any(String)));
    expect(repo.calls[0]?.lines).toEqual([{ kind: 'quick', amountPaise: 5000 }]);
    expect(repo.calls[0]?.payments).toEqual([{ method: 'cash', amountPaise: 5000 }]);
  });

  it('shows the UPI QR with the bill amount', async () => {
    const { deps } = setup({ ...baseSettings, upiVpa: 'sharma@okaxis' });
    await renderWithProviders(<BillingScreen deps={deps} context={context()} onCompleted={jest.fn()} />);
    await fireEvent.press(await screen.findByText('2'));
    await fireEvent.press(screen.getByText('Pay'));
    await fireEvent.press(await screen.findByText('UPI'));
    expect(await screen.findByText(/qr:upi:\/\/pay\?pa=sharma%40okaxis.*am=2\.00/)).toBeTruthy();
  });
});

describe('ReceiptScreen', () => {
  it('shows the bill and shares it on WhatsApp, in Hindi too', async () => {
    const repo = new FakeBillingRepository();
    repo.sales.set(SALE.saleId, SALE);
    const sharer: ReceiptSharer = { sharePdf: jest.fn(async () => {}), shareText: jest.fn(async () => {}) };
    const deps = { getSale: new GetSale(repo), shareReceipt: new ShareReceipt(sharer) };
    await renderWithProviders(
      <ReceiptScreen deps={deps} shopId={SHOP_A} saleId={SALE.saleId} onNewBill={jest.fn()} />,
      { language: 'hi' },
    );
    expect(await screen.findByText('बिल: DS/2627/A-000007')).toBeTruthy();
    await fireEvent.press(screen.getByText('WhatsApp पर भेजें'));
    await waitFor(() => expect(sharer.shareText).toHaveBeenCalledTimes(1));
    expect((sharer.shareText as jest.Mock).mock.calls[0][0]).toContain('*कुल: ₹70.00*');
  });
});
