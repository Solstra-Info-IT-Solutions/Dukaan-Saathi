import type { ExpenseCategory, ExpenseDto, RecordExpenseInput } from '@ds/contracts';

// Contract shapes are already what the domain needs (validated by Zod in the data layer).
export type Expense = ExpenseDto;
export type RecordExpenseCommand = RecordExpenseInput;
export type { ExpenseCategory };
export type ExpenseMethod = Expense['method'];

export interface ExpensePhoto {
  uri: string;
  mimeType: string;
}

/** Camera / gallery access for receipt photos (core/files implements it). */
export interface ReceiptPhotoPicker {
  fromCamera(): Promise<ExpensePhoto | null>;
  fromLibrary(): Promise<ExpensePhoto | null>;
}
