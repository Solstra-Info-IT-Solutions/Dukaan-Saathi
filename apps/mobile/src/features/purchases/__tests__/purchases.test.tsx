import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { SHOP_A } from '../../../../tests/fakes/shops';
import { renderWithProviders } from '../../../../tests/renderWithProviders';
import type {
  CatalogueProduct,
  CatalogueReference,
  PurchaseCommand,
  SaveSupplierCommand,
  Supplier,
  SupplierLedgerEntry,
  SupplierPaymentCommand,
} from '../domain/entities/Purchases';
import type { PurchaseRepository } from '../domain/repositories/PurchaseRepository';
import {
  GetSupplierLedger,
  ListSuppliers,
  PurchaseInputError,
  purchaseLine,
  purchaseTotal,
  ReceivePurchase,
  RecordSupplierPayment,
  SaveSupplier,
} from '../domain/usecases/purchaseUseCases';
import { PurchaseFormScreen } from '../presentation/screens/PurchaseFormScreen';
import { SupplierDetailScreen } from '../presentation/screens/SupplierDetailScreen';
import { SuppliersScreen } from '../presentation/screens/SuppliersScreen';

const DEVICE = '0190f0f0-0000-7000-8000-0000000000d1';
const GUPTA: Supplier = {
  id: '0190f0f0-0000-7000-8000-0000000008f1',
  name: 'Gupta Traders',
  phone: '+919811111111',
  gstin: null,
  note: null,
  balancePaise: 50000,
  archivedAt: null,
};
const ATTA: CatalogueProduct = {
  id: '0190f0f0-0000-7000-8000-0000000008e1',
  name: 'Atta',
  nameHi: null,
  categoryId: null,
  unitCode: 'kg',
  pricePaise: 5000,
  mrpPaise: null,
  lastCostPaise: 4000,
  taxRateCode: null,
  hsnCode: null,
  trackStock: true,
  stockOnHandMilli: 9500,
  lowStockThresholdMilli: null,
  isActive: true,
  barcodes: [],
  aliases: [],
  updatedAt: '2026-10-25T05:30:00Z',
};
const REFERENCE: CatalogueReference = {
  units: [{ code: 'kg', label: { en: 'Kilogram' }, allowsFraction: true }],
  taxRates: [],
  categories: [],
};

/** Supplier balance = opening + purchases − payments, like the server ledger. */
class FakePurchaseRepository implements PurchaseRepository {
  suppliers: Supplier[] = [{ ...GUPTA }];
  purchases: PurchaseCommand[] = [];
  payments: SupplierPaymentCommand[] = [];
  saved: SaveSupplierCommand[] = [];
  async listSuppliers() {
    return this.suppliers;
  }
  async saveSupplier(command: SaveSupplierCommand) {
    this.saved.push(command);
    const s: Supplier = {
      id: command.id,
      name: command.name,
      phone: command.phone ?? null,
      gstin: null,
      note: null,
      balancePaise: command.openingBalancePaise ?? 0,
      archivedAt: null,
    };
    this.suppliers.push(s);
    return s;
  }
  async ledger(): Promise<SupplierLedgerEntry[]> {
    return [
      {
        id: '0190f0f0-0000-7000-8000-0000000009a1',
        kind: 'opening',
        amountPaise: 50000,
        method: null,
        purchaseId: null,
        note: null,
        createdAt: '2026-10-24T05:30:00Z',
      },
    ];
  }
  async receivePurchase(command: PurchaseCommand) {
    this.purchases.push(command);
    const total = command.lines.reduce(
      (s, l) => s + Math.round((l.unitCostPaise * l.quantityMilli) / 1000),
      0,
    );
    const paid = command.payments.reduce((s, p) => s + p.amountPaise, 0);
    const supplier = this.suppliers.find((s) => s.id === command.supplierId);
    if (supplier) supplier.balancePaise += total - paid;
    return {
      purchaseId: '0190f0f0-0000-7000-8000-0000000009b1',
      totalPaise: total,
      paidPaise: paid,
      supplierBalancePaise: supplier?.balancePaise ?? null,
      replayed: false,
    };
  }
  async paySupplier(command: SupplierPaymentCommand) {
    this.payments.push(command);
    const supplier = this.suppliers.find((s) => s.id === command.supplierId)!;
    supplier.balancePaise -= command.amountPaise;
    return { balancePaise: supplier.balancePaise };
  }
}

let ids = 0;
const newId = () => `0190f0f0-0000-7000-8000-${String(++ids).padStart(12, '0')}`;
const deps = (repo: FakePurchaseRepository) => ({
  listSuppliers: new ListSuppliers(repo),
  saveSupplier: new SaveSupplier(repo),
  getLedger: new GetSupplierLedger(repo),
  paySupplier: new RecordSupplierPayment(repo),
  receivePurchase: new ReceivePurchase(repo),
  products: { search: async () => [ATTA], reference: async () => REFERENCE },
  newId,
});

describe('purchase rules', () => {
  it('a line starts at 1 unit with the last cost; total = cost × quantity', () => {
    const line = purchaseLine(ATTA, REFERENCE, 'k');
    expect(line).toMatchObject({ quantityText: '1', costText: '40', allowsFraction: true });
    expect(
      purchaseTotal([
        { ...line, quantityText: '10' },
        { ...line, key: 'x', quantityText: 'oops' },
      ]),
    ).toBe(40000);
  });

  it('a purchase without a supplier must be paid in full; paid cannot exceed the total', async () => {
    const repo = new FakePurchaseRepository();
    const use = new ReceivePurchase(repo);
    const base = {
      clientOperationId: newId(),
      shopId: SHOP_A,
      deviceId: DEVICE,
      invoiceNo: '',
      method: 'cash' as const,
      lines: [{ ...purchaseLine(ATTA, REFERENCE, 'k'), quantityText: '10' }],
    };
    await expect(use.execute({ ...base, supplierId: null, paidText: '100' })).rejects.toMatchObject({
      reason: 'UNPAID_NEEDS_SUPPLIER',
    });
    await expect(use.execute({ ...base, supplierId: GUPTA.id, paidText: '500' })).rejects.toMatchObject({
      reason: 'PAID_MORE_THAN_TOTAL',
    });
    await use.execute({ ...base, supplierId: null, paidText: '' });
    expect(repo.purchases[0]?.payments).toEqual([{ method: 'cash', amountPaise: 40000 }]);
  });

  it('a bad line is reported with its key', async () => {
    const repo = new FakePurchaseRepository();
    const line = { ...purchaseLine(ATTA, REFERENCE, 'bad'), costText: 'x' };
    await expect(
      new ReceivePurchase(repo).execute({
        clientOperationId: newId(),
        shopId: SHOP_A,
        deviceId: DEVICE,
        supplierId: GUPTA.id,
        invoiceNo: '',
        lines: [line],
        paidText: '',
        method: 'cash',
      }),
    ).rejects.toEqual(new PurchaseInputError('INVALID_LINE', 'bad'));
  });
});

describe('purchase screens', () => {
  it('lists suppliers with what is owed', async () => {
    const repo = new FakePurchaseRepository();
    await renderWithProviders(
      <SuppliersScreen
        deps={deps(repo)}
        shopId={SHOP_A}
        canManage
        canReceive
        onOpen={jest.fn()}
        onAdd={jest.fn()}
        onNewPurchase={jest.fn()}
      />,
    );
    expect(await screen.findByText('You owe suppliers: ₹500.00')).toBeTruthy();
    expect(screen.getByText('Gupta Traders')).toBeTruthy();
  });

  it('receives 10 kg of atta from a supplier, paying part now', async () => {
    const repo = new FakePurchaseRepository();
    await renderWithProviders(
      <PurchaseFormScreen
        deps={deps(repo)}
        shopId={SHOP_A}
        deviceId={DEVICE}
        supplierId={GUPTA.id}
        onDone={jest.fn()}
      />,
    );
    await fireEvent.changeText(await screen.findByLabelText('Search item'), 'at');
    await fireEvent.press(await screen.findByText('Atta'));
    await fireEvent.changeText(await screen.findByLabelText('Quantity of Atta'), '10');
    await fireEvent.changeText(screen.getByLabelText('New selling price of Atta'), '52');
    expect(await screen.findByText('Total: ₹400.00')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Paid now (₹)'), '200');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Saved: ₹400.00, paid ₹200.00')).toBeTruthy();
    expect(screen.getByText('You owe ₹700.00')).toBeTruthy();
    expect(repo.purchases[0]).toMatchObject({
      supplierId: GUPTA.id,
      lines: [{ productId: ATTA.id, quantityMilli: 10000, unitCostPaise: 4000 }],
      payments: [{ method: 'cash', amountPaise: 20000 }],
      priceUpdates: [{ productId: ATTA.id, pricePaise: 5200 }],
    });
  });

  it('pays a supplier from the detail screen', async () => {
    const repo = new FakePurchaseRepository();
    await renderWithProviders(
      <SupplierDetailScreen
        deps={deps(repo)}
        shopId={SHOP_A}
        deviceId={DEVICE}
        supplierId={GUPTA.id}
        canPay
        canReceive
        onNewPurchase={jest.fn()}
      />,
    );
    expect(await screen.findByText('You owe ₹500.00')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Payment amount'), '300');
    await fireEvent.press(screen.getByText('Save payment'));
    await waitFor(() => expect(repo.payments).toHaveLength(1));
    expect(await screen.findByText('You owe ₹200.00')).toBeTruthy();
  });
});
