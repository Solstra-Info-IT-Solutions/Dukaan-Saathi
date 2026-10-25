import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { SHOP_A } from '../../../../tests/fakes/shops';
import { renderWithProviders } from '../../../../tests/renderWithProviders';
import type { Expense, ExpensePhoto, RecordExpenseCommand } from '../domain/entities/Expense';
import type { ExpenseRepository } from '../domain/repositories/ExpenseRepository';
import {
  activeTotal,
  ExpenseInputError,
  GetExpensePhotoUrl,
  ListExpenses,
  RecordExpense,
  VoidExpense,
} from '../domain/usecases/expenseUseCases';
import { ExpenseFormScreen } from '../presentation/screens/ExpenseFormScreen';
import { ExpensesScreen } from '../presentation/screens/ExpensesScreen';

const DEVICE = '0190f0f0-0000-7000-8000-0000000000d1';
const NOW = new Date('2026-10-25T05:30:00.000Z');

class FakeExpenseRepository implements ExpenseRepository {
  items: Expense[] = [];
  calls: string[] = [];
  recorded: RecordExpenseCommand[] = [];
  async list() {
    return this.items;
  }
  async record(command: RecordExpenseCommand) {
    this.calls.push('record');
    this.recorded.push(command);
    const e: Expense = {
      id: command.id,
      businessDate: '2026-10-25',
      category: command.category,
      amountPaise: command.amountPaise,
      method: command.method,
      note: command.note ?? null,
      attachmentPath: command.attachmentPath ?? null,
      createdAt: NOW.toISOString(),
      voidedAt: null,
      voidReason: null,
    };
    this.items = [e, ...this.items];
    return e;
  }
  async void(_shopId: string, id: string, reason: string) {
    this.items = this.items.map((e) =>
      e.id === id ? { ...e, voidedAt: NOW.toISOString(), voidReason: reason } : e,
    );
    return this.items.find((e) => e.id === id)!;
  }
  async uploadPhoto(shopId: string, expenseId: string, _photo: ExpensePhoto) {
    this.calls.push('upload');
    return `${shopId}/${expenseId}/receipt.jpg`;
  }
  async photoUrl(path: string) {
    return `https://signed.example/${path}`;
  }
}

let ids = 0;
const newId = () => `0190f0f0-0000-7000-8000-${String(++ids).padStart(12, '0')}`;
const tea = (over: Partial<Expense> = {}): Expense => ({
  id: newId(),
  businessDate: '2026-10-25',
  category: 'tea_snacks',
  amountPaise: 300,
  method: 'cash',
  note: null,
  attachmentPath: null,
  createdAt: NOW.toISOString(),
  voidedAt: null,
  voidReason: null,
  ...over,
});

describe('RecordExpense', () => {
  it('uploads the photo first and records the expense with its path', async () => {
    const repo = new FakeExpenseRepository();
    const id = newId();
    await new RecordExpense(repo).execute({
      id,
      shopId: SHOP_A,
      deviceId: DEVICE,
      category: 'rent',
      amountPaise: 10000,
      method: 'upi',
      note: '  October ',
      photo: { uri: 'file:///r.jpg', mimeType: 'image/jpeg' },
    });
    expect(repo.calls).toEqual(['upload', 'record']);
    expect(repo.recorded[0]).toEqual({
      id,
      shopId: SHOP_A,
      deviceId: DEVICE,
      category: 'rent',
      amountPaise: 10000,
      method: 'upi',
      note: 'October',
      attachmentPath: `${SHOP_A}/${id}/receipt.jpg`,
    });
  });

  it('needs an amount; totals skip voided expenses', async () => {
    const repo = new FakeExpenseRepository();
    await expect(
      new RecordExpense(repo).execute({
        id: newId(),
        shopId: SHOP_A,
        deviceId: DEVICE,
        category: 'rent',
        amountPaise: null,
        method: 'cash',
        note: '',
        photo: null,
      }),
    ).rejects.toBeInstanceOf(ExpenseInputError);
    expect(activeTotal([tea(), tea({ voidedAt: NOW.toISOString() }), tea({ amountPaise: 10000 })])).toBe(
      10300,
    );
  });
});

describe('expense screens', () => {
  it('adds an expense with the same id on retry', async () => {
    const repo = new FakeExpenseRepository();
    const onSaved = jest.fn();
    await renderWithProviders(
      <ExpenseFormScreen
        deps={{
          recordExpense: new RecordExpense(repo),
          photos: { fromCamera: async () => null, fromLibrary: async () => null },
          newId,
        }}
        shopId={SHOP_A}
        deviceId={DEVICE}
        onSaved={onSaved}
      />,
    );
    await fireEvent.press(screen.getByText('Save expense'));
    expect(await screen.findByText('Enter the amount.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Electricity'));
    await fireEvent.changeText(screen.getByLabelText('Amount (₹)'), '850');
    await fireEvent.press(screen.getByText('Save expense'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(repo.recorded[0]).toMatchObject({ category: 'electricity', amountPaise: 85000, method: 'cash' });
  });

  it('lists expenses with the total; the owner voids one with a reason', async () => {
    const repo = new FakeExpenseRepository();
    repo.items = [
      tea({ note: 'Morning tea' }),
      tea({ category: 'rent', amountPaise: 10000, method: 'upi', attachmentPath: 'x/y/receipt.jpg' }),
    ];
    const openUrl = jest.fn(async () => {});
    await renderWithProviders(
      <ExpensesScreen
        deps={{
          listExpenses: new ListExpenses(repo),
          voidExpense: new VoidExpense(repo),
          photoUrl: new GetExpensePhotoUrl(repo),
          openUrl,
          now: () => NOW,
        }}
        shopId={SHOP_A}
        canCreate
        canVoid
        onAdd={jest.fn()}
      />,
    );
    expect(await screen.findByText('Total: ₹103.00')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('View receipt photo'));
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith('https://signed.example/x/y/receipt.jpg'));
    await fireEvent.press(screen.getAllByLabelText('Void expense')[0]!);
    await fireEvent.changeText(await screen.findByLabelText('Reason'), 'Entered twice');
    const buttons = screen.getAllByText('Void expense');
    await fireEvent.press(buttons[buttons.length - 1]!);
    expect(await screen.findByText('Total: ₹100.00')).toBeTruthy();
  });
});
