import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AppError } from '@/core/errors/AppError';
import { baseSettings, SHOP_A } from '../../../../tests/fakes/shops';
import { renderHookWithQuery, renderWithProviders } from '../../../../tests/renderWithProviders';
import {
  addProductLine,
  changeDue,
  discountLimitBp,
  draftTotals,
  keypadToPaise,
  pressKeypad,
  productLine,
  quantityFromAmount,
  quantityFromText,
  splitPayments,
  upiPaymentUri,
} from '../domain/billMath';
import {
  type BillingContext,
  type BillLine,
  type CatalogueProduct,
  type CatalogueReference,
  type CreatedSale,
  type InvoiceCounterStore,
  InvoiceSequenceConflict,
  PriceChanged,
  type ProductFinder,
  type ReceiptSharer,
  type ReturnCommand,
  type Sale,
  type SaleCommand,
  type SaleFilter,
  type VoidCommand,
} from '../domain/entities/Bill';
import { buildReceipt, type ReceiptLabels, receiptHtml, receiptText } from '../domain/receipt';
import type { BillingRepository } from '../domain/repositories/BillingRepository';
import {
  BillInputError,
  CreateSale,
  CreateSaleReturn,
  GetSale,
  ListSales,
  ShareReceipt,
  VoidSale,
} from '../domain/usecases/billingUseCases';
import { BillingScreen } from '../presentation/screens/BillingScreen';
import { ReceiptScreen } from '../presentation/screens/ReceiptScreen';
import { SalesHistoryScreen } from '../presentation/screens/SalesHistoryScreen';
import { useBillingViewModel } from '../presentation/viewmodels/useBillingViewModel';
import { startOfIstDay } from '../presentation/viewmodels/useSalesHistoryViewModel';

const DEVICE = '0190f0f0-0000-7000-8000-0000000000d1';
const NOW = '2026-10-25T05:30:00.000Z'; // FY 2627

const SUGAR: CatalogueProduct = {
  id: '0190f0f0-0000-7000-8000-0000000000e1',
  name: 'Sugar 1kg',
  nameHi: 'चीनी',
  categoryId: null,
  unitCode: 'pc',
  pricePaise: 4500,
  mrpPaise: null,
  taxRateCode: null,
  hsnCode: null,
  trackStock: true,
  stockOnHandMilli: 10000,
  lowStockThresholdMilli: null,
  isActive: true,
  barcodes: ['8901234567890'],
  aliases: ['cheeni'],
  updatedAt: NOW,
};
const ONION: CatalogueProduct = {
  ...SUGAR,
  id: '0190f0f0-0000-7000-8000-0000000000e2',
  name: 'Pyaaz',
  nameHi: null,
  unitCode: 'kg',
  pricePaise: 4000,
  barcodes: [],
  aliases: [],
};
const SHAMPOO: CatalogueProduct = {
  ...SUGAR,
  id: '0190f0f0-0000-7000-8000-0000000000e3',
  name: 'Shampoo',
  unitCode: 'pc',
  pricePaise: 11800,
  taxRateCode: 'GST_18',
  barcodes: [],
  aliases: [],
};
const REFERENCE: CatalogueReference = {
  units: [
    { code: 'pc', label: { en: 'Piece' }, allowsFraction: false },
    { code: 'kg', label: { en: 'Kilogram' }, allowsFraction: true },
  ],
  taxRates: [{ code: 'GST_18', rateBp: 1800, label: 'GST 18%' }],
  categories: [],
};

/** Simulates create_sale / void_sale / list_sales: sequence per series, idempotent replays, lost responses. */
class FakeBillingRepository implements BillingRepository {
  lastSeq = 0;
  calls: SaleCommand[] = [];
  saved = new Map<string, { payload: string; result: CreatedSale }>();
  sales = new Map<string, Sale>();
  voids: VoidCommand[] = [];
  returns: ReturnCommand[] = [];
  listCalls: SaleFilter[] = [];
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

  async listSales(_shopId: string, filter: SaleFilter) {
    this.listCalls.push(filter);
    const items = [...this.sales.values()]
      .filter((s) => !filter.status || s.status === filter.status)
      .map((s) => ({
        saleId: s.saleId,
        invoiceNumber: s.invoiceNumber,
        createdAt: s.createdAt,
        status: s.status,
        totalPaise: s.totals.totalPaise,
        itemCount: s.lines.length,
        methods: s.payments.map((p) => p.method),
        createdByName: s.createdByName,
      }));
    return { items, nextCursor: null };
  }

  async createReturn(command: ReturnCommand) {
    this.returns.push(command);
    const sale = this.sales.get(command.saleId)!;
    let refund = 0;
    const lines = sale.lines.map((l) => {
      const r = command.lines.find((x) => x.lineNo === l.lineNo);
      if (!r) return l;
      refund += Math.round((l.netPaise * r.quantityMilli) / l.quantityMilli);
      return { ...l, returnedQuantityMilli: (l.returnedQuantityMilli ?? 0) + r.quantityMilli };
    });
    const ret = {
      returnId: '0190f0f0-0000-7000-8000-000000000901',
      createdAt: NOW,
      refundPaise: refund,
      refundMethod: command.refundMethod,
      reason: command.reason,
      lines: command.lines.map((l) => ({ ...l, refundPaise: 0 })),
    };
    this.sales.set(sale.saleId, { ...sale, lines, returns: [...(sale.returns ?? []), ret] });
    return {
      returnId: ret.returnId,
      saleId: sale.saleId,
      refundPaise: refund,
      refundMethod: command.refundMethod,
      replayed: false,
    };
  }

  async voidSale(command: VoidCommand): Promise<Sale> {
    this.voids.push(command);
    const sale = this.sales.get(command.saleId)!;
    const voided = { ...sale, status: 'voided' as const, voidedAt: NOW, voidReason: command.reason };
    this.sales.set(sale.saleId, voided);
    return voided;
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

const finder = (products: CatalogueProduct[] = [SUGAR, ONION, SHAMPOO]): ProductFinder => ({
  search: async (_shopId, text) => products.filter((p) => p.name.toLowerCase().includes(text.toLowerCase())),
  byBarcode: async (_shopId, code) => products.find((p) => p.barcodes.includes(code)) ?? null,
  reference: async () => REFERENCE,
});

const context = (over: Partial<BillingContext> = {}): BillingContext => ({
  shopId: SHOP_A,
  shopName: 'Sharma Kirana',
  role: 'owner',
  canDiscount: true,
  canOverridePrice: true,
  canManageProducts: true,
  deviceId: DEVICE,
  fy: '2627',
  lastSeq: 0,
  ...over,
});

let idCounter = 0;
const newId = () => `0190f0f0-0000-7000-8000-${String(++idCounter).padStart(12, '0')}`;

function setup(settings = baseSettings, products?: CatalogueProduct[]) {
  const repo = new FakeBillingRepository();
  const counter = new MemoryCounter();
  const deps = {
    getSettings: { execute: async () => settings },
    createSale: new CreateSale(repo, counter),
    products: finder(products),
    newId,
    now: () => new Date(NOW),
  };
  return { repo, counter, deps };
}

const quick = (...amounts: number[]): BillLine[] =>
  amounts.map((a, i) => ({ kind: 'quick', key: String(i), label: '', amountPaise: a }));
const draft = (...amounts: number[]) => ({ lines: quick(...amounts), billDiscountPaise: 0 });
const attempt = (opId = newId()) => ({ clientOperationId: opId, occurredAt: NOW });
const cash = (amountPaise: number) => [{ method: 'cash' as const, amountPaise }];

describe('bill maths', () => {
  it('keypad builds rupee amounts and refuses invalid input', () => {
    const typed = (keys: string[]) => keys.reduce((e, k) => pressKeypad(e, k as never), '');
    expect(typed(['4', '0'])).toBe('40');
    expect(typed(['0', '0', '5'])).toBe('5');
    expect(typed(['.', '5'])).toBe('0.5');
    expect(typed(['1', '.', '2', '5', '9'])).toBe('1.25');
    expect(typed(['1', '2', 'back'])).toBe('1');
    expect(keypadToPaise('40')).toBe(4000);
    expect(keypadToPaise('0')).toBeNull();
  });

  it('totals match the server rule, including round-off, line discounts and GST', () => {
    expect(
      draftTotals(
        { lines: quick(1250, 4099, 2000), billDiscountPaise: 300 },
        { taxMode: 'none', roundOffEnabled: true },
      ),
    ).toEqual({ subtotalPaise: 7349, discountPaise: 300, taxPaise: 0, roundOffPaise: -49, totalPaise: 7000 });
    const shampoo = productLine(SHAMPOO, REFERENCE, 'x');
    expect(
      draftTotals(
        { lines: [shampoo], billDiscountPaise: 0 },
        { taxMode: 'gst_regular', roundOffEnabled: false },
      ),
    ).toMatchObject({ subtotalPaise: 11800, taxPaise: 1800, totalPaise: 11800 });
    const onion = { ...productLine(ONION, REFERENCE, 'y'), quantityMilli: 250, lineDiscountPaise: 100 };
    expect(
      draftTotals({ lines: [onion], billDiscountPaise: 0 }, { taxMode: 'none', roundOffEnabled: false }),
    ).toMatchObject({ subtotalPaise: 1000, discountPaise: 100, totalPaise: 900 });
  });

  it('product lines: fractions, "₹ worth" for loose items, repeat adds one unit', () => {
    const onion = productLine(ONION, REFERENCE, 'a');
    expect(onion).toMatchObject({ allowsFraction: true, quantityMilli: 1000, taxRateBp: 0 });
    expect(quantityFromAmount(onion, 1000)).toBe(250); // ₹10 of ₹40/kg = 250 g
    const sugar = productLine(SUGAR, REFERENCE, 'b');
    expect(quantityFromAmount(sugar, 10000)).toBe(2000); // ₹100 of ₹45 → 2 pieces, not 2.2
    expect(quantityFromAmount(sugar, 4000)).toBeNull();
    expect(quantityFromText('0.25', true)).toBe(250);
    expect(quantityFromText('1.5', false)).toBeNull();
    const twice = addProductLine(addProductLine([], sugar), { ...sugar, key: 'c' });
    expect(twice).toHaveLength(1);
    expect((twice[0] as typeof sugar).quantityMilli).toBe(2000);
  });

  it('discount limits by role, change, split payments and UPI link', () => {
    expect(discountLimitBp('owner', baseSettings)).toBe(10000);
    expect(discountLimitBp('cashier', baseSettings)).toBe(0);
    expect(changeDue(10000, 7500)).toBe(2500);
    expect(changeDue(5000, 7500)).toBeNull();
    expect(splitPayments(7500, 'cash', { method: 'upi', amountPaise: 5000 })).toEqual([
      { method: 'cash', amountPaise: 2500 },
      { method: 'upi', amountPaise: 5000 },
    ]);
    expect(splitPayments(7500, 'cash', { method: 'upi', amountPaise: 7500 })).toBeNull();
    expect(splitPayments(7500, 'cash', { method: 'cash', amountPaise: 100 })).toBeNull();
    expect(splitPayments(0, 'cash', null)).toEqual([]);
    expect(upiPaymentUri({ vpa: 'sharma@okaxis', payeeName: 'Sharma Kirana', amountPaise: 7505 })).toBe(
      'upi://pay?pa=sharma%40okaxis&pn=Sharma%20Kirana&am=75.05&cu=INR',
    );
  });
});

describe('CreateSale', () => {
  const settings = {
    ...baseSettings,
    enabledPaymentMethods: ['cash', 'upi'] as typeof baseSettings.enabledPaymentMethods,
  };

  it('numbers bills from the device series and remembers the last number', async () => {
    const { repo, counter, deps } = setup();
    repo.lastSeq = 4;
    const ctx = context({ lastSeq: 4 });
    const first = await deps.createSale.execute({
      context: ctx,
      settings,
      draft: draft(5000),
      payments: cash(5000),
      attempt: attempt(),
    });
    expect(first.invoiceNumber).toBe('DS/2627/A-000005');
    const second = await deps.createSale.execute({
      context: ctx,
      settings,
      draft: draft(100),
      payments: [{ method: 'upi', amountPaise: 100 }],
      attempt: attempt(),
    });
    expect(second.seq).toBe(6);
    expect([...counter.values.values()]).toEqual([6]);
  });

  it('moves to the number the server expects and resends the same operation', async () => {
    const { repo, deps } = setup();
    repo.lastSeq = 9;
    const a = attempt();
    const created = await deps.createSale.execute({
      context: context(),
      settings,
      draft: draft(5000),
      payments: cash(5000),
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
    const input = {
      context: context(),
      settings,
      draft: draft(5000),
      payments: cash(5000),
      attempt: attempt(),
    };
    await expect(deps.createSale.execute(input)).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });
    expect((await deps.createSale.execute(input)).replayed).toBe(true);
    expect(repo.saved.size).toBe(1);
  });

  it('sends product lines with overrides and line discounts, split payments', async () => {
    const { repo, deps } = setup();
    const sugar = { ...productLine(SUGAR, REFERENCE, 's'), unitPricePaise: 4000, lineDiscountPaise: 500 };
    await deps.createSale.execute({
      context: context(),
      settings,
      draft: { lines: [sugar], billDiscountPaise: 0 },
      payments: [
        { method: 'cash', amountPaise: 1500 },
        { method: 'upi', amountPaise: 2000 },
      ],
      attempt: attempt(),
      source: 'scan',
    });
    expect(repo.calls[0]).toMatchObject({
      source: 'scan',
      lines: [
        {
          kind: 'product',
          productId: SUGAR.id,
          quantityMilli: 1000,
          unitPricePaise: 4000,
          priceOverride: true,
          lineDiscountPaise: 500,
          entryMode: 'quantity',
        },
      ],
      payments: [
        { method: 'cash', amountPaise: 1500 },
        { method: 'upi', amountPaise: 2000 },
      ],
      clientTotals: { subtotalPaise: 4000, discountPaise: 500, totalPaise: 3500 },
    });
  });

  it('refuses empty bills, disabled methods and payments that do not add up', async () => {
    const { deps } = setup();
    await expect(
      deps.createSale.execute({
        context: context(),
        settings,
        draft: draft(),
        payments: [],
        attempt: attempt(),
      }),
    ).rejects.toBeInstanceOf(BillInputError);
    await expect(
      deps.createSale.execute({
        context: context(),
        settings,
        draft: draft(100),
        payments: [{ method: 'card', amountPaise: 100 }],
        attempt: attempt(),
      }),
    ).rejects.toMatchObject({ reason: 'METHOD_NOT_ENABLED' });
    await expect(
      deps.createSale.execute({
        context: context(),
        settings,
        draft: draft(100),
        payments: cash(90),
        attempt: attempt(),
      }),
    ).rejects.toMatchObject({ reason: 'PAYMENTS_DO_NOT_MATCH' });
  });

  it('VoidSale needs a reason', async () => {
    const repo = new FakeBillingRepository();
    await expect(
      new VoidSale(repo).execute({ shopId: SHOP_A, saleId: 'x', reason: ' a ', clientOperationId: newId() }),
    ).rejects.toMatchObject({ reason: 'REASON_REQUIRED' });
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
      kind: 'product',
      productId: ONION.id,
      label: 'Pyaaz',
      unitCode: 'kg',
      quantityMilli: 625,
      unitPricePaise: 4000,
      grossPaise: 2500,
      lineDiscountPaise: 0,
      billDiscountSharePaise: 167,
      netPaise: 2333,
      taxRateBp: 0,
      taxPaise: 0,
      hsnCode: '0703',
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
  taxInvoice: 'Tax invoice',
  hsn: 'HSN',
  voided: 'VOIDED',
  returned: 'Returned',
  method: (m) => m.toUpperCase(),
  unit: (u) => u,
  formatDate: () => '25 Oct 2026, 11:00 am',
};

describe('receipt', () => {
  it('builds WhatsApp text with quantities, discount, total and a manual UPI note', () => {
    const text = receiptText(buildReceipt(SALE, LABELS), LABELS);
    expect(text).toContain('*Sharma Kirana*');
    expect(text).toContain('Bill: DS/2627/A-000007');
    expect(text).toContain('Pyaaz (0.625 kg × ₹40.00)  ₹25.00');
    expect(text).toContain('Discount: -₹5.00');
    expect(text).toContain('*Total: ₹70.00*');
    expect(text).toContain('UPI ₹70.00 (confirmed by shop)');
    expect(text).not.toContain('HSN');
  });

  it('escapes shop and line text in the PDF HTML', () => {
    const html = receiptHtml(buildReceipt(SALE, LABELS), LABELS);
    expect(html).toContain('Doodh &lt;b&gt;');
    expect(html).not.toContain('Doodh <b>');
  });

  it('GST shops get a tax invoice with HSN and CGST/SGST; voided bills say so', () => {
    const gst = { ...SALE, taxMode: 'gst_regular' as const, totals: { ...SALE.totals, taxPaise: 1069 } };
    const r = buildReceipt(gst, LABELS);
    expect(r.title).toBe('Tax invoice');
    expect(r.lines[1]?.label).toContain('HSN 0703');
    expect(r.totals.filter((t) => t.label === 'CGST' || t.label === 'SGST').map((t) => t.amount)).toEqual([
      '₹5.35',
      '₹5.34',
    ]);
    const voided = buildReceipt({ ...SALE, status: 'voided', voidReason: 'Wrong items' }, LABELS);
    expect(receiptText(voided, LABELS).split('\n')[0]).toBe('*VOIDED: Wrong items*');
  });
});

describe('useBillingViewModel', () => {
  async function ready(deps: ReturnType<typeof setup>['deps'], ctx = context(), onCompleted = jest.fn()) {
    const hook = await renderHookWithQuery(() => useBillingViewModel(deps, ctx, onCompleted));
    await waitFor(() => expect(hook.result.current.state.loading).toBe(false));
    return hook;
  }

  it('a double tap on save sends one request and completes once', async () => {
    const { repo, deps } = setup();
    const onCompleted = jest.fn();
    const { result } = await ready(deps, context(), onCompleted);
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
    const { result } = await ready(deps);
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
    const { result } = await ready(deps, context({ role: 'manager' }));
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
    expect(repo.calls).toHaveLength(0);
  });

  it('scans a known barcode twice (two units) and reports an unknown one', async () => {
    const { deps } = setup();
    const { result } = await ready(deps);
    await act(async () => result.current.actions.openScanner());
    await act(async () => result.current.actions.scanned('8901234567890'));
    expect(result.current.state.scan).toEqual({ kind: 'closed' });
    await act(async () => result.current.actions.scanned('8901234567890'));
    expect(result.current.state.lines).toHaveLength(1);
    expect(result.current.state.lines[0]).toMatchObject({ kind: 'product', quantityMilli: 2000 });
    await act(async () => result.current.actions.scanned('0000'));
    expect(result.current.state.scan).toEqual({ kind: 'unknown', code: '0000' });
  });

  it('line editor: "₹10 worth" of a loose item and a price override', async () => {
    const { repo, deps } = setup({ ...baseSettings, priceOverrideAllowed: true });
    const { result } = await ready(deps);
    await act(async () => result.current.actions.pickResult(ONION));
    const key = result.current.state.lines[0]!.key;
    await act(async () => result.current.actions.openLine(key));
    await act(async () => result.current.actions.editLine({ amountText: '10' }));
    await act(async () => result.current.actions.saveLine());
    expect(result.current.state.lines[0]).toMatchObject({ quantityMilli: 250, entryMode: 'amount' });
    await act(async () => result.current.actions.openLine(key));
    await act(async () => result.current.actions.editLine({ priceText: '36', quantityText: '1' }));
    await act(async () => result.current.actions.saveLine());
    expect(result.current.state.totals?.totalPaise).toBe(3600);
    await act(async () => result.current.actions.openPayment());
    await act(async () => result.current.actions.submit());
    expect(repo.calls[0]?.lines[0]).toMatchObject({ unitPricePaise: 3600, priceOverride: true });
    expect(repo.calls[0]?.source).toBe('search');
  });

  it('takes a changed catalogue price and asks to check the total again', async () => {
    const { repo, deps } = setup();
    const { result } = await ready(deps);
    await act(async () => result.current.actions.pickResult(SUGAR));
    await act(async () => result.current.actions.openPayment());
    repo.failNext = new PriceChanged(SUGAR.id, 4800);
    await act(async () => result.current.actions.submit());
    expect(result.current.state.phase).toBe('editing');
    expect(result.current.state.errorKey).toBe('billing.errors.PRICE_CHANGED');
    expect(result.current.state.totals?.totalPaise).toBe(4800);
  });

  it('splits a payment between cash and UPI', async () => {
    const { repo, deps } = setup({ ...baseSettings, enabledPaymentMethods: ['cash', 'upi'] });
    const { result } = await ready(deps);
    await act(async () => {
      result.current.actions.press('1');
      result.current.actions.press('0');
      result.current.actions.press('0');
    });
    await act(async () => result.current.actions.openPayment());
    await act(async () => result.current.actions.toggleSplit());
    await act(async () => result.current.actions.setSplitAmount('60'));
    await act(async () => result.current.actions.submit());
    expect(repo.calls[0]?.payments).toEqual([
      { method: 'cash', amountPaise: 4000 },
      { method: 'upi', amountPaise: 6000 },
    ]);
  });
});

describe('BillingScreen', () => {
  it('amount → Pay → Cash received saves the bill', async () => {
    const { repo, deps } = setup();
    const onCompleted = jest.fn();
    await renderWithProviders(
      <BillingScreen deps={deps} context={context()} onCompleted={onCompleted} onCreateProduct={jest.fn()} />,
    );
    await fireEvent.press(await screen.findByText('5'));
    await fireEvent.press(screen.getByText('0'));
    await fireEvent.press(screen.getByText('Pay'));
    await fireEvent.changeText(await screen.findByLabelText('Cash received from customer (₹)'), '100');
    expect(await screen.findByText('Give back ₹50.00')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cash received – save bill'));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledWith(expect.any(String)));
    expect(repo.calls[0]?.lines).toEqual([{ kind: 'quick', amountPaise: 5000 }]);
  });

  it('search adds an item; the UPI QR carries the bill amount', async () => {
    const { deps } = setup({ ...baseSettings, upiVpa: 'sharma@okaxis' });
    await renderWithProviders(
      <BillingScreen deps={deps} context={context()} onCompleted={jest.fn()} onCreateProduct={jest.fn()} />,
    );
    await fireEvent.changeText(await screen.findByLabelText('Search item'), 'sug');
    await fireEvent.press(await screen.findByText('Sugar 1kg'));
    expect(await screen.findByText('1 pc × ₹45.00')).toBeTruthy();
    await fireEvent.press(screen.getByText('Pay ₹45.00'));
    await fireEvent.press(await screen.findByText('UPI'));
    expect(await screen.findByText(/qr:upi:\/\/pay\?pa=sharma%40okaxis.*am=45\.00/)).toBeTruthy();
  });
});

describe('ReceiptScreen', () => {
  function receiptDeps(repo: FakeBillingRepository, sharer?: ReceiptSharer) {
    return {
      getSale: new GetSale(repo),
      shareReceipt: new ShareReceipt(
        sharer ?? { sharePdf: jest.fn(async () => {}), shareText: jest.fn(async () => {}) },
      ),
      voidSale: new VoidSale(repo),
      createReturn: new CreateSaleReturn(repo),
      newId,
    };
  }

  it('shows the bill and shares it on WhatsApp, in Hindi too', async () => {
    const repo = new FakeBillingRepository();
    repo.sales.set(SALE.saleId, SALE);
    const sharer: ReceiptSharer = { sharePdf: jest.fn(async () => {}), shareText: jest.fn(async () => {}) };
    await renderWithProviders(
      <ReceiptScreen
        deps={receiptDeps(repo, sharer)}
        shopId={SHOP_A}
        saleId={SALE.saleId}
        deviceId={DEVICE}
        canVoid={false}
        canReturn={false}
        onNewBill={jest.fn()}
      />,
      { language: 'hi' },
    );
    expect(await screen.findByText('बिल: DS/2627/A-000007')).toBeTruthy();
    expect(screen.queryByText('बिल रद्द करें')).toBeNull();
    await fireEvent.press(screen.getByText('WhatsApp पर भेजें'));
    await waitFor(() => expect(sharer.shareText).toHaveBeenCalledTimes(1));
    expect((sharer.shareText as jest.Mock).mock.calls[0][0]).toContain('*कुल: ₹70.00*');
  });

  it('voids with a reason and shows the bill as voided', async () => {
    const repo = new FakeBillingRepository();
    repo.sales.set(SALE.saleId, SALE);
    await renderWithProviders(
      <ReceiptScreen
        deps={receiptDeps(repo)}
        shopId={SHOP_A}
        saleId={SALE.saleId}
        deviceId={DEVICE}
        canVoid
        canReturn={false}
        onNewBill={jest.fn()}
      />,
    );
    await fireEvent.press(await screen.findByText('Void bill'));
    await fireEvent.changeText(await screen.findByLabelText('Reason'), 'Wrong items');
    const buttons = screen.getAllByText('Void bill');
    await fireEvent.press(buttons[buttons.length - 1]!);
    expect(await screen.findByText('VOIDED: Wrong items')).toBeTruthy();
    expect(repo.voids).toEqual([expect.objectContaining({ saleId: SALE.saleId, reason: 'Wrong items' })]);
  });
});

describe('returns', () => {
  it('returns part of a line with a reason and shows the refund on the receipt', async () => {
    const repo = new FakeBillingRepository();
    repo.sales.set(SALE.saleId, SALE);
    await renderWithProviders(
      <ReceiptScreen
        deps={{
          getSale: new GetSale(repo),
          shareReceipt: new ShareReceipt({
            sharePdf: jest.fn(async () => {}),
            shareText: jest.fn(async () => {}),
          }),
          voidSale: new VoidSale(repo),
          createReturn: new CreateSaleReturn(repo),
          newId,
        }}
        shopId={SHOP_A}
        saleId={SALE.saleId}
        deviceId={DEVICE}
        canVoid={false}
        canReturn
        onNewBill={jest.fn()}
      />,
    );
    await fireEvent.press(await screen.findByText('Return items'));
    await fireEvent.changeText(await screen.findByLabelText('Return quantity of Doodh <b>'), '0');
    await fireEvent.changeText(screen.getByLabelText('Return quantity of Pyaaz'), '0.25');
    await fireEvent.changeText(screen.getByLabelText('Reason for return'), 'Spoilt');
    await fireEvent.press(screen.getByText('Refund'));
    await waitFor(() => expect(repo.returns).toHaveLength(1));
    expect(repo.returns[0]).toMatchObject({
      saleId: SALE.saleId,
      deviceId: DEVICE,
      lines: [{ lineNo: 2, quantityMilli: 250 }],
      refundMethod: 'cash',
      reason: 'Spoilt',
    });
    expect(await screen.findByText('Returned ₹9.33 (Cash): Spoilt')).toBeTruthy();
  });

  it('refuses a return with nothing chosen or without a reason', async () => {
    const repo = new FakeBillingRepository();
    const use = new CreateSaleReturn(repo);
    const base = {
      clientOperationId: newId(),
      shopId: SHOP_A,
      deviceId: DEVICE,
      saleId: SALE.saleId,
      refundMethod: 'cash' as const,
    };
    await expect(
      use.execute({ ...base, lines: [{ lineNo: 1, quantityMilli: 0 }], reason: 'Spoilt' }),
    ).rejects.toMatchObject({
      reason: 'NOTHING_TO_RETURN',
    });
    await expect(
      use.execute({ ...base, lines: [{ lineNo: 1, quantityMilli: 1000 }], reason: '' }),
    ).rejects.toMatchObject({
      reason: 'REASON_REQUIRED',
    });
  });
});

describe('sales history', () => {
  it('a day starts at midnight in India', () => {
    expect(startOfIstDay(new Date('2026-10-25T20:00:00Z')).toISOString()).toBe('2026-10-25T18:30:00.000Z');
    expect(startOfIstDay(new Date('2026-10-25T10:00:00Z')).toISOString()).toBe('2026-10-24T18:30:00.000Z');
  });

  it('lists bills, filters voided ones and opens a bill', async () => {
    const repo = new FakeBillingRepository();
    repo.sales.set(SALE.saleId, SALE);
    repo.sales.set('0190f0f0-0000-7000-8000-000000000102', {
      ...SALE,
      saleId: '0190f0f0-0000-7000-8000-000000000102',
      invoiceNumber: 'DS/2627/A-000008',
      status: 'voided',
    });
    const onOpenSale = jest.fn();
    await renderWithProviders(
      <SalesHistoryScreen
        deps={{ listSales: new ListSales(repo), now: () => new Date(NOW) }}
        shopId={SHOP_A}
        onOpenSale={onOpenSale}
      />,
    );
    expect(await screen.findByText('DS/2627/A-000007')).toBeTruthy();
    expect(repo.listCalls[0]).toMatchObject({ from: '2026-10-24T18:30:00.000Z', status: null });
    await fireEvent.press(screen.getByText('Voided only'));
    await waitFor(() => expect(screen.queryByText('DS/2627/A-000007')).toBeNull());
    await fireEvent.press(screen.getByText('DS/2627/A-000008'));
    expect(onOpenSale).toHaveBeenCalledWith('0190f0f0-0000-7000-8000-000000000102');
  });
});
