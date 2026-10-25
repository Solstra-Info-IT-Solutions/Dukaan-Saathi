import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { SHOP_A } from '../../../../tests/fakes/shops';
import { renderWithProviders } from '../../../../tests/renderWithProviders';
import type {
  AdjustCommand,
  CountCommand,
  StockDrift,
  StockItem,
  StockMovement,
} from '../domain/entities/Inventory';
import type { InventoryRepository } from '../domain/repositories/InventoryRepository';
import {
  AdjustStock,
  CheckStockDrift,
  GetStockMovements,
  ListStock,
  quantityInput,
  StockInputError,
  SubmitStockCount,
} from '../domain/usecases/inventoryUseCases';
import { StockCountScreen } from '../presentation/screens/StockCountScreen';
import { StockItemScreen } from '../presentation/screens/StockItemScreen';
import { StockScreen } from '../presentation/screens/StockScreen';

const ATTA: StockItem = {
  productId: '0190f0f0-0000-7000-8000-0000000008e1',
  name: 'Atta',
  nameHi: null,
  unitCode: 'kg',
  allowsFraction: true,
  stockOnHandMilli: 9500,
  lowStockThresholdMilli: 5000,
  isLow: false,
};
const SOAP: StockItem = {
  productId: '0190f0f0-0000-7000-8000-0000000008e2',
  name: 'Soap',
  nameHi: null,
  unitCode: 'pc',
  allowsFraction: false,
  stockOnHandMilli: 1000,
  lowStockThresholdMilli: 2000,
  isLow: true,
};

/** Keeps on-hand = sum of applied changes, like the server. */
class FakeInventoryRepository implements InventoryRepository {
  items = [ATTA, SOAP].map((i) => ({ ...i }));
  adjustments: AdjustCommand[] = [];
  counts: CountCommand[] = [];
  drift: StockDrift[] = [];
  async listStock(_shopId: string, lowOnly: boolean, query: string) {
    return this.items
      .filter((i) => !lowOnly || i.isLow)
      .filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
  }
  async movements(): Promise<StockMovement[]> {
    return [
      {
        id: '0190f0f0-0000-7000-8000-000000080901',
        kind: 'purchase',
        quantityMilli: 10000,
        reason: null,
        note: null,
        createdAt: '2026-10-25T05:30:00Z',
      },
    ];
  }
  async adjust(command: AdjustCommand) {
    this.adjustments.push(command);
    const item = this.items.find((i) => i.productId === command.productId)!;
    item.stockOnHandMilli += command.deltaMilli;
    return { stockOnHandMilli: item.stockOnHandMilli };
  }
  async submitCount(command: CountCommand) {
    this.counts.push(command);
    const items = command.counts.map((c) => {
      const item = this.items.find((i) => i.productId === c.productId)!;
      const previous = item.stockOnHandMilli;
      item.stockOnHandMilli = c.countedMilli;
      return {
        productId: c.productId,
        previousMilli: previous,
        countedMilli: c.countedMilli,
        deltaMilli: c.countedMilli - previous,
      };
    });
    return { items, replayed: false };
  }
  async checkDrift() {
    return this.drift;
  }
}

let ids = 0;
const newId = () => `0190f0f0-0000-7000-8000-${String(++ids).padStart(12, '0')}`;
const deps = (repo: FakeInventoryRepository) => ({
  listStock: new ListStock(repo),
  checkDrift: new CheckStockDrift(repo),
  getMovements: new GetStockMovements(repo),
  adjustStock: new AdjustStock(repo),
  submitCount: new SubmitStockCount(repo),
  newId,
});

describe('stock rules', () => {
  it('quantities respect whole-unit items', () => {
    expect(quantityInput('2.5', true)).toBe(2500);
    expect(() => quantityInput('2.5', false)).toThrow(StockInputError);
    expect(() => quantityInput('abc', true)).toThrow(StockInputError);
  });

  it('removing stock sends a negative change with the reason', async () => {
    const repo = new FakeInventoryRepository();
    await new AdjustStock(repo).execute({
      clientOperationId: newId(),
      shopId: SHOP_A,
      item: ATTA,
      direction: 'remove',
      quantityText: '0.5',
      reason: 'damage',
      note: ' torn bag ',
    });
    expect(repo.adjustments[0]).toMatchObject({ deltaMilli: -500, reason: 'damage', note: 'torn bag' });
  });

  it('a count sends only the items that were filled in', async () => {
    const repo = new FakeInventoryRepository();
    await expect(
      new SubmitStockCount(repo).execute({
        clientOperationId: newId(),
        shopId: SHOP_A,
        items: [ATTA, SOAP],
        counted: {},
        note: '',
      }),
    ).rejects.toMatchObject({ reason: 'NOTHING_COUNTED' });
    await new SubmitStockCount(repo).execute({
      clientOperationId: newId(),
      shopId: SHOP_A,
      items: [ATTA, SOAP],
      counted: { [SOAP.productId]: '3' },
      note: '',
    });
    expect(repo.counts[0]?.counts).toEqual([{ productId: SOAP.productId, countedMilli: 3000 }]);
  });
});

describe('stock screens', () => {
  it('lists stock with low items marked, filters low only, and checks the records', async () => {
    const repo = new FakeInventoryRepository();
    const onOpenItem = jest.fn();
    await renderWithProviders(
      <StockScreen deps={deps(repo)} shopId={SHOP_A} canAdjust onOpenItem={onOpenItem} onCount={jest.fn()} />,
    );
    expect(await screen.findByText('9.5 kg')).toBeTruthy();
    expect(screen.getByText('Low')).toBeTruthy();
    await fireEvent.press(screen.getByText('Low stock'));
    await waitFor(() => expect(screen.queryByText('Atta')).toBeNull());
    await fireEvent.press(screen.getByText('Check stock records'));
    expect(await screen.findByText('Stock records are consistent.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Soap'));
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ productId: SOAP.productId }));
  });

  it('adds stock to an item and shows the new quantity and its history', async () => {
    const repo = new FakeInventoryRepository();
    await renderWithProviders(
      <StockItemScreen deps={deps(repo)} shopId={SHOP_A} productId={SOAP.productId} canAdjust />,
    );
    expect(await screen.findByText('In stock: 1 pc')).toBeTruthy();
    expect(screen.getByText('+10 pc')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Quantity (pc)'), '1.5');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('This item is counted in whole units.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Quantity (pc)'), '12');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('In stock: 13 pc')).toBeTruthy();
    expect(repo.adjustments).toHaveLength(1);
  });

  it('a stock count shows what changed', async () => {
    const repo = new FakeInventoryRepository();
    await renderWithProviders(<StockCountScreen deps={deps(repo)} shopId={SHOP_A} onDone={jest.fn()} />);
    await fireEvent.changeText(await screen.findByLabelText('Counted Atta'), '9');
    await fireEvent.press(screen.getByText('Save count'));
    expect(await screen.findByText('Atta: 9.5 → 9')).toBeTruthy();
  });
});
