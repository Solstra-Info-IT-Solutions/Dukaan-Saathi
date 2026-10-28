import type { ImportField, ImportRowInput } from '@ds/domain-core';
import { translateError } from '@/core/errors/translateError';
import type { ImportRow } from '../../domain/entities/Import';
import type { ImportRepository } from '../../domain/repositories/ImportRepository';
import type {
  ImportRowRecord,
  SupabaseImportDataSource,
} from '../datasources/remote/SupabaseImportDataSource';

export const toImportRow = (r: ImportRowRecord): ImportRow => ({
  rowId: r.id,
  rowNumber: r.row_number,
  raw: r.raw,
  errors: r.errors,
  action: r.action,
});

async function translated<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw translateError(e);
  }
}

export class ImportRepositoryImpl implements ImportRepository {
  constructor(private readonly remote: SupabaseImportDataSource) {}

  getJob = (jobId: string) => translated(() => this.remote.getJob(jobId));
  createJob = (shopId: string, fileName: string, opId: string) =>
    translated(() => this.remote.createJob(shopId, fileName, opId));
  stageRows = (jobId: string, rows: ImportRowInput[]) => translated(() => this.remote.stageRows(jobId, rows));
  listProblemRows = (jobId: string, limit: number) =>
    translated(async () => (await this.remote.listProblemRows(jobId, limit)).map(toImportRow));
  updateRow = (rowId: string, patch: Partial<Record<ImportField, string>>, skip?: boolean) =>
    translated(() => this.remote.updateRow(rowId, patch, skip));
  commit = (jobId: string, opId: string) => translated(() => this.remote.commit(jobId, opId));
  cancel = (jobId: string) => translated(() => this.remote.cancel(jobId));
}
