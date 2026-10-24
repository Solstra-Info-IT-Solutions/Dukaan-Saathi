import type { CommitImportOutputDto, ImportJobSummaryDto } from '@ds/contracts';
import type { ImportField } from '@ds/domain-core';

export type ImportJobSummary = ImportJobSummaryDto;
export type ImportCommitResult = CommitImportOutputDto;

/** A staged spreadsheet row that still needs attention (or any row, when listing all). */
export interface ImportRow {
  rowId: string;
  rowNumber: number;
  raw: Partial<Record<ImportField, string>>;
  errors: string[];
  action: 'create' | 'update' | 'skip';
}

export interface PickedFile {
  name: string;
  text: string;
}

/** Platform port: lets the user choose a CSV file and returns its text (null if cancelled). */
export interface CsvFileSource {
  pick(): Promise<PickedFile | null>;
}

export interface ImportPreview {
  summary: ImportJobSummary;
  unmappedHeaders: string[];
}
