import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AppError } from '@/core/errors/AppError';
import { SHOP_A } from '../../../../tests/fakes/shops';
import { renderWithProviders } from '../../../../tests/renderWithProviders';
import type {
  AdjustmentCommand,
  Customer,
  CustomerLedgerEntry,
  CustomerQuery,
  RepaymentCommand,
  SaveCustomerCommand,
} from '../domain/entities/Customers';
import type { CustomerRepository } from '../domain/repositories/CustomerRepository';
import {
  AdjustBalance,
  buildReminderMessage,
  CustomerInputError,
  GetCustomerLedger,
  ListCustomers,
  RecordRepayment,
  SaveCustomer,
  whatsappUrl,
} from '../domain/usecases/customerUseCases';
import { CustomerFormScreen } from '../presentation/screens/CustomerFormScreen';
import { CustomerLedgerScreen } from '../presentation/screens/CustomerLedgerScreen';
import { UdhaarListScreen } from '../presentation/screens/UdhaarListScreen';

const DEVICE = '0190f0f0-0000-7000-8000-0000000000d1';
const customer = (over: Partial<Customer>): Customer => ({
  id: '0190f0f0-0000-7000-8000-0000000009e1',
  name: 'Ramesh',
  phone: '+919822222222',
  note: null,
  creditLimitPaise: null,
  balancePaise: 0,
  udhaarSince: null,
  lastActivityAt: null,
  archivedAt: null,
  createdAt: '2026-10-20T05:30:00Z',
  ...over,
});
const RAMESH = customer({ balancePaise: 80000, udhaarSince: '2026-10-20T05:30:00Z' });
const SITA = customer({
  id: '0190f0f0-0000-7000-8000-0000000009e2',
  name: 'Sita',
  phone: null,
  balancePaise: 1000,
});
const MOHAN = customer({ id: '0190f0f0-0000-7000-8000-0000000009e3', name: 'Mohan', balancePaise: 0 });

/** Balance = sum of entries, entries newest first, like the server ledger. */
class FakeCustomerRepository implements CustomerRepository {
  customers = [RAMESH, SITA, MOHAN].map((c) => ({ ...c }));
  entries = new Map<string, CustomerLedgerEntry[]>([
    [
      RAMESH.id,
      [this.entry('sale', 30000, 80000, 'DS/2627/A-000001'), this.entry('opening', 50000, 50000, null)],
    ],
  ]);
  saved: SaveCustomerCommand[] = [];
  repayments: RepaymentCommand[] = [];
  adjustments: AdjustmentCommand[] = [];
  failNext: Error | null = null;
  private seen = new Set<string>();
  private n = 0;

  private entry(kind: CustomerLedgerEntry['kind'], amount: number, after: number, invoice: string | null) {
    this.n += 1;
    return {
      id: `0190f0f0-0000-7000-8000-0000000091${String(this.n).padStart(2, '0')}`,
      kind,
      amountPaise: amount,
      balanceAfterPaise: after,
      method: kind === 'repayment' ? ('cash' as const) : null,
      saleId: invoice ? '0190f0f0-0000-7000-8000-000000009301' : null,
      invoiceNumber: invoice,
      note: null,
      businessDate: '2026-10-25',
      createdAt: '2026-10-25T05:30:00Z',
      createdByName: 'Owner',
    };
  }
  private apply(customerId: string, kind: CustomerLedgerEntry['kind'], amount: number) {
    const c = this.customers.find((x) => x.id === customerId)!;
    c.balancePaise += amount;
    this.entries.set(customerId, [
      this.entry(kind, amount, c.balancePaise, null),
      ...(this.entries.get(customerId) ?? []),
    ]);
    return { balancePaise: c.balancePaise };
  }

  async list(_shopId: string, q: CustomerQuery) {
    const rows = this.customers
      .filter((c) => !q.udhaarOnly || c.balancePaise > 0)
      .filter((c) => c.name.toLowerCase().includes(q.query.toLowerCase()))
      .sort((a, b) =>
        q.sort === 'highest' ? b.balancePaise - a.balancePaise : a.name.localeCompare(b.name),
      );
    const owing = this.customers.filter((c) => c.balancePaise > 0);
    return {
      rows,
      totalOutstandingPaise: owing.reduce((s, c) => s + c.balancePaise, 0),
      customersWithUdhaar: owing.length,
    };
  }
  async save(command: SaveCustomerCommand) {
    this.saved.push(command);
    const c = customer({ id: command.id, name: command.name, phone: command.phone ?? null, balancePaise: 0 });
    this.customers.push(c);
    if (command.openingBalancePaise) this.apply(c.id, 'opening', command.openingBalancePaise);
    return c;
  }
  async ledger(_shopId: string, customerId: string) {
    return {
      customer: { ...this.customers.find((c) => c.id === customerId)! },
      entries: this.entries.get(customerId) ?? [],
    };
  }
  async recordRepayment(command: RepaymentCommand) {
    this.repayments.push(command);
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
    if (this.seen.has(command.clientOperationId)) {
      return { balancePaise: this.customers.find((c) => c.id === command.customerId)!.balancePaise };
    }
    this.seen.add(command.clientOperationId);
    return this.apply(command.customerId, 'repayment', -command.amountPaise);
  }
  async adjustBalance(command: AdjustmentCommand) {
    this.adjustments.push(command);
    return this.apply(command.customerId, 'adjustment', command.amountPaise);
  }
}

let ids = 0;
const newId = () => `0190f0f0-0000-7000-8000-${String(++ids).padStart(12, '0')}`;
const deps = (repo: FakeCustomerRepository, openUrl = jest.fn(async () => true)) => ({
  listCustomers: new ListCustomers(repo),
  saveCustomer: new SaveCustomer(repo),
  getLedger: new GetCustomerLedger(repo),
  recordRepayment: new RecordRepayment(repo),
  adjustBalance: new AdjustBalance(repo),
  getUpiVpa: async () => 'sharma@okaxis',
  openUrl,
  newId,
});
const SHOP = { shopId: SHOP_A, shopName: 'Sharma Kirana', deviceId: DEVICE };

describe('customer rules', () => {
  it('saves a customer with an advance, a credit limit and a normalised phone', async () => {
    const repo = new FakeCustomerRepository();
    await new SaveCustomer(repo).execute({
      id: newId(),
      shopId: SHOP_A,
      name: ' Geeta ',
      phoneText: '98111 22233',
      openingText: '-200',
      creditLimitText: '1500',
    });
    expect(repo.saved[0]).toMatchObject({
      name: 'Geeta',
      phone: '+919811122233',
      openingBalancePaise: -20000,
      creditLimitPaise: 150000,
    });
    await expect(
      new SaveCustomer(repo).execute({ id: newId(), shopId: SHOP_A, name: 'X', phoneText: '12345' }),
    ).rejects.toMatchObject({ reason: 'INVALID_PHONE' });
    await expect(
      new SaveCustomer(repo).execute({ id: newId(), shopId: SHOP_A, name: ' ', phoneText: '' }),
    ).rejects.toBeInstanceOf(CustomerInputError);
  });

  it('repayments need an amount; adjustments need a reason and keep their sign', async () => {
    const repo = new FakeCustomerRepository();
    const base = { clientOperationId: newId(), shopId: SHOP_A, customerId: RAMESH.id };
    await expect(
      new RecordRepayment(repo).execute({
        ...base,
        deviceId: DEVICE,
        amountText: '0',
        method: 'cash',
        note: '',
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_AMOUNT' });
    await expect(
      new AdjustBalance(repo).execute({ ...base, direction: 'reduce', amountText: '100', reason: 'x' }),
    ).rejects.toMatchObject({ reason: 'REASON_REQUIRED' });
    await new AdjustBalance(repo).execute({
      ...base,
      direction: 'reduce',
      amountText: '100',
      reason: 'Old discount',
    });
    expect(repo.adjustments[0]).toMatchObject({ amountPaise: -10000, reason: 'Old discount' });
  });

  it('builds the WhatsApp reminder in English and Hindi with a UPI link', () => {
    const input = {
      customerName: 'Ramesh',
      shopName: 'Sharma Kirana',
      balancePaise: 80000,
      upiVpa: 'sharma@okaxis',
    };
    const en = buildReminderMessage({ ...input, language: 'en' });
    expect(en).toContain('Your udhaar at Sharma Kirana is ₹800.00.');
    expect(en).toContain('upi://pay?pa=sharma%40okaxis&pn=Sharma%20Kirana&am=800.00&cu=INR');
    const hi = buildReminderMessage({ ...input, language: 'hi', upiVpa: null });
    expect(hi).toContain('Sharma Kirana पर आपका उधार ₹800.00 बाकी है।');
    expect(hi).not.toContain('upi://');
    expect(whatsappUrl('+919822222222', 'Hi there')).toBe('https://wa.me/919822222222?text=Hi%20there');
    expect(whatsappUrl(null, 'Hi')).toBe('https://wa.me/?text=Hi');
  });
});

describe('udhaar screens', () => {
  it('lists who owes what, highest first, with the total; searches and opens a customer', async () => {
    const repo = new FakeCustomerRepository();
    const onOpen = jest.fn();
    await renderWithProviders(
      <UdhaarListScreen deps={deps(repo)} shopId={SHOP_A} canAdd onOpen={onOpen} onAdd={jest.fn()} />,
    );
    expect(await screen.findByText('Udhaar outstanding: ₹810.00')).toBeTruthy();
    expect(screen.getByText('Owes ₹800.00')).toBeTruthy();
    expect(screen.queryByText('Mohan')).toBeNull(); // settled customers are hidden by default
    await fireEvent.changeText(screen.getByLabelText('Search name or phone'), 'sit');
    await waitFor(() => {
      expect(screen.getByText('Sita')).toBeTruthy();
      expect(screen.queryByText('Ramesh')).toBeNull();
    });
    await fireEvent.press(screen.getByText('Sita'));
    expect(onOpen).toHaveBeenCalledWith(SITA.id);
  });

  it('records a repayment once even after a failed try, and shows each entry with the balance after it', async () => {
    const repo = new FakeCustomerRepository();
    await renderWithProviders(
      <CustomerLedgerScreen
        deps={deps(repo)}
        shop={SHOP}
        customerId={RAMESH.id}
        canCollect
        canAdjust={false}
        onOpenSale={jest.fn()}
      />,
    );
    expect(await screen.findByText('Owes ₹800.00')).toBeTruthy();
    expect(screen.getByText(/Bill on udhaar \+₹300\.00/)).toBeTruthy();
    expect(screen.queryByText('Correct the balance (owner)')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Amount received'), '200');
    repo.failNext = new AppError('NETWORK_TIMEOUT');
    await fireEvent.press(screen.getByText('Save payment'));
    await waitFor(() => expect(repo.repayments).toHaveLength(1));
    await fireEvent.press(screen.getByText('Save payment'));
    expect(await screen.findByText('Owes ₹600.00')).toBeTruthy();
    expect(repo.repayments[1]?.clientOperationId).toBe(repo.repayments[0]?.clientOperationId);
    expect(repo.repayments[1]).toMatchObject({ amountPaise: 20000, method: 'cash', deviceId: DEVICE });
    expect(screen.getByText('Paid −₹200.00')).toBeTruthy();
    expect(screen.getByText(/Cash · then Owes ₹600\.00/)).toBeTruthy();
  });

  it('the owner corrects a balance with a reason; the reminder opens WhatsApp with the text', async () => {
    const repo = new FakeCustomerRepository();
    const openUrl = jest.fn(async () => true);
    await renderWithProviders(
      <CustomerLedgerScreen
        deps={deps(repo, openUrl)}
        shop={SHOP}
        customerId={RAMESH.id}
        canCollect={false}
        canAdjust
        onOpenSale={jest.fn()}
      />,
    );
    await fireEvent.changeText(await screen.findByLabelText('Correction amount'), '100');
    await fireEvent.changeText(screen.getByLabelText('Reason (required)'), 'Discount for old customer');
    await fireEvent.press(screen.getByText('Save correction'));
    expect(await screen.findByText('Owes ₹700.00')).toBeTruthy();
    expect(repo.adjustments[0]).toMatchObject({ amountPaise: -10000 });
    await fireEvent.press(screen.getByText('Send WhatsApp reminder'));
    await waitFor(() => expect(openUrl).toHaveBeenCalled());
    const url = String((openUrl.mock.calls[0] as unknown[])[0]);
    expect(url.startsWith('https://wa.me/919822222222?text=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('Your udhaar at Sharma Kirana is ₹700.00.');
  });

  it('a cashier adds a customer with name and phone only', async () => {
    const repo = new FakeCustomerRepository();
    const onSaved = jest.fn();
    await renderWithProviders(
      <CustomerFormScreen deps={deps(repo)} shopId={SHOP_A} canManage={false} onSaved={onSaved} />,
    );
    expect(screen.queryByLabelText('Udhaar already owed (₹, optional)')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Customer name'), 'Geeta');
    await fireEvent.changeText(screen.getByLabelText('Phone (optional)'), '9811122233');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(repo.saved[0]?.id));
    expect(repo.saved[0]).toEqual({
      id: repo.saved[0]?.id,
      shopId: SHOP_A,
      name: 'Geeta',
      phone: '+919811122233',
    });
  });
});
