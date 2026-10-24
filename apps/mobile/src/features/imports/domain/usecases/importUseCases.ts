import { chunk, type ImportField, mapImportTable, parseCsv } from '@ds/domain-core';
import type {
  ImportCommitResult,
  ImportJobSummary,
  ImportPreview,
  ImportRow,
  PickedFile,
} from '../entities/Import';
import type { ImportRepository } from '../repositories/ImportRepository';

export const STAGE_BATCH_SIZE = 500;
export const MAX_FILE_CHARS = 5_000_000; // ~5 MB of text; larger files belong in managed onboarding

export class ImportInputError extends Error {
  constructor(
    readonly reason: 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'MISSING_COLUMNS' | 'NO_ROWS',
    readonly missing: ImportField[] = [],
  ) {
    super(reason);
    this.name = 'ImportInputError';
  }
}

/**
 * Parses the CSV on the device, maps its columns, creates an import job and stages the rows in
 * batches. The server validates every row; this only rejects files that cannot be an import at all.
 */
export class PreviewCsvImport {
  constructor(
    private readonly imports: ImportRepository,
    private readonly newId: () => string,
  ) {}

  async execute(shopId: string, file: PickedFile): Promise<ImportPreview> {
    if (file.text.trim() === '') throw new ImportInputError('EMPTY_FILE');
    if (file.text.length > MAX_FILE_CHARS) throw new ImportInputError('FILE_TOO_LARGE');
    const mapped = mapImportTable(parseCsv(file.text));
    if (mapped.missingRequired.length > 0)
      throw new ImportInputError('MISSING_COLUMNS', mapped.missingRequired);
    if (mapped.rows.length === 0) throw new ImportInputError('NO_ROWS');

    let summary = await this.imports.createJob(shopId, file.name, this.newId());
    for (const batch of chunk(mapped.rows, STAGE_BATCH_SIZE)) {
      summary = await this.imports.stageRows(summary.jobId, batch);
    }
    return { summary, unmappedHeaders: mapped.unmappedHeaders };
  }
}

export class ListProblemRows {
  constructor(private readonly imports: ImportRepository) {}
  execute(jobId: string, limit = 200): Promise<ImportRow[]> {
    return this.imports.listProblemRows(jobId, limit);
  }
}

export class FixImportRow {
  constructor(private readonly imports: ImportRepository) {}
  execute(rowId: string, patch: Partial<Record<ImportField, string>>): Promise<ImportJobSummary> {
    const cleaned = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, (v ?? '').trim()]));
    return this.imports.updateRow(rowId, cleaned);
  }
}

export class SkipImportRow {
  constructor(private readonly imports: ImportRepository) {}
  execute(rowId: string): Promise<ImportJobSummary> {
    return this.imports.updateRow(rowId, {}, true);
  }
}

export class CommitImport {
  constructor(private readonly imports: ImportRepository) {}
  /** The caller keeps the operation id for retries, so a repeated tap cannot import twice. */
  execute(jobId: string, clientOperationId: string): Promise<ImportCommitResult> {
    return this.imports.commit(jobId, clientOperationId);
  }
}
