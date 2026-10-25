import { translateError } from '@/core/errors/translateError';
import type { ExpensePhoto, RecordExpenseCommand } from '../../domain/entities/Expense';
import type { ExpenseRepository } from '../../domain/repositories/ExpenseRepository';
import type { SupabaseExpenseDataSource } from '../datasources/remote/SupabaseExpenseDataSource';

async function translated<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw translateError(e);
  }
}

export class ExpenseRepositoryImpl implements ExpenseRepository {
  constructor(private readonly remote: SupabaseExpenseDataSource) {}

  list = (shopId: string, from: string, to: string) => translated(() => this.remote.list(shopId, from, to));
  record = (command: RecordExpenseCommand) => translated(() => this.remote.record(command));
  void = (shopId: string, expenseId: string, reason: string) =>
    translated(() => this.remote.void(shopId, expenseId, reason));
  uploadPhoto = (shopId: string, expenseId: string, photo: ExpensePhoto) =>
    translated(() => this.remote.uploadPhoto(shopId, expenseId, photo));
  photoUrl = (path: string) => translated(() => this.remote.photoUrl(path));
}
