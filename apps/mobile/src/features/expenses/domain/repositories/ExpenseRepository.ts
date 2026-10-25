import type { Expense, ExpensePhoto, RecordExpenseCommand } from '../entities/Expense';

export interface ExpenseRepository {
  /** Newest first, business dates in [from, to]. */
  list(shopId: string, from: string, to: string): Promise<Expense[]>;
  /** Safe to repeat: the expense id is the idempotency key. */
  record(command: RecordExpenseCommand): Promise<Expense>;
  void(shopId: string, expenseId: string, reason: string): Promise<Expense>;
  /** Uploads (or replaces) the receipt photo under "<shop>/<expense>/receipt.<ext>"; returns the storage path. */
  uploadPhoto(shopId: string, expenseId: string, photo: ExpensePhoto): Promise<string>;
  /** Short-lived link to view a private receipt photo. */
  photoUrl(path: string): Promise<string>;
}
