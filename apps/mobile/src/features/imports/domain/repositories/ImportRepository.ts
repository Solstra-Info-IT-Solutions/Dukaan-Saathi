import type { ImportField, ImportRowInput } from '@ds/domain-core';
import type { ImportCommitResult, ImportJobSummary, ImportRow } from '../entities/Import';

export interface ImportRepository {
  /** A job of this shop by id (an import our team prepared for the owner to check). */
  getJob(jobId: string): Promise<ImportJobSummary>;
  createJob(shopId: string, fileName: string, clientOperationId: string): Promise<ImportJobSummary>;
  stageRows(jobId: string, rows: ImportRowInput[]): Promise<ImportJobSummary>;
  /** Rows with errors that are not skipped, in spreadsheet order. */
  listProblemRows(jobId: string, limit: number): Promise<ImportRow[]>;
  updateRow(
    rowId: string,
    patch: Partial<Record<ImportField, string>>,
    skip?: boolean,
  ): Promise<ImportJobSummary>;
  commit(jobId: string, clientOperationId: string): Promise<ImportCommitResult>;
  cancel(jobId: string): Promise<void>;
}
