import type { Expense, ExpenseCategory, ExpenseMethod, ExpensePhoto } from '../entities/Expense';
import type { ExpenseRepository } from '../repositories/ExpenseRepository';

export class ExpenseInputError extends Error {
  constructor(readonly reason: 'AMOUNT_REQUIRED' | 'AMOUNT_TOO_HIGH' | 'REASON_REQUIRED') {
    super(reason);
    this.name = 'ExpenseInputError';
  }
}

export const MAX_EXPENSE_PAISE = 100_000_000;

/**
 * Records an expense. The id is chosen by the caller once per form, so a retry after a timeout
 * returns the same expense; a photo is uploaded first so the expense always points to a stored file.
 */
export class RecordExpense {
  constructor(private readonly expenses: ExpenseRepository) {}

  async execute(input: {
    id: string;
    shopId: string;
    deviceId: string;
    category: ExpenseCategory;
    amountPaise: number | null;
    method: ExpenseMethod;
    note: string;
    photo: ExpensePhoto | null;
  }): Promise<Expense> {
    if (input.amountPaise === null || input.amountPaise < 1) throw new ExpenseInputError('AMOUNT_REQUIRED');
    if (input.amountPaise > MAX_EXPENSE_PAISE) throw new ExpenseInputError('AMOUNT_TOO_HIGH');
    const attachmentPath = input.photo
      ? await this.expenses.uploadPhoto(input.shopId, input.id, input.photo)
      : undefined;
    return this.expenses.record({
      id: input.id,
      shopId: input.shopId,
      deviceId: input.deviceId,
      category: input.category,
      amountPaise: input.amountPaise,
      method: input.method,
      ...(input.note.trim() ? { note: input.note.trim() } : {}),
      ...(attachmentPath ? { attachmentPath } : {}),
    });
  }
}

export class ListExpenses {
  constructor(private readonly expenses: ExpenseRepository) {}
  execute(shopId: string, from: string, to: string): Promise<Expense[]> {
    return this.expenses.list(shopId, from, to);
  }
}

export class VoidExpense {
  constructor(private readonly expenses: ExpenseRepository) {}
  async execute(shopId: string, expenseId: string, reason: string): Promise<Expense> {
    const r = reason.trim();
    if (r.length < 3 || r.length > 200) throw new ExpenseInputError('REASON_REQUIRED');
    return this.expenses.void(shopId, expenseId, r);
  }
}

export class GetExpensePhotoUrl {
  constructor(private readonly expenses: ExpenseRepository) {}
  execute(path: string): Promise<string> {
    return this.expenses.photoUrl(path);
  }
}

/** Total of the expenses that are not voided. */
export const activeTotal = (list: readonly Expense[]) =>
  list.filter((e) => !e.voidedAt).reduce((sum, e) => sum + e.amountPaise, 0);
