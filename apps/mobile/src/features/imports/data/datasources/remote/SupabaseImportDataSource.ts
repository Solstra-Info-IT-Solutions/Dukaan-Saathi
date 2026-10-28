import { CommitImportOutputSchema, ImportJobSummarySchema } from '@ds/contracts';
import type { ImportField, ImportRowInput } from '@ds/domain-core';
import { z } from 'zod';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';

const RowRecordSchema = z.object({
  id: z.uuid(),
  row_number: z.number().int(),
  raw: z.record(z.string(), z.string()),
  errors: z.array(z.string()),
  action: z.enum(['create', 'update', 'skip']),
});
export type ImportRowRecord = z.infer<typeof RowRecordSchema>;

export class SupabaseImportDataSource {
  constructor(private readonly client: TypedSupabaseClient) {}

  private async call<T>(promise: PromiseLike<{ data: unknown; error: unknown }>, parse: (d: unknown) => T) {
    const { data, error } = await promise;
    if (error) throw error;
    return parse(data);
  }

  getJob(jobId: string) {
    return this.call(this.client.rpc('get_import_job', { p_job_id: jobId }), (d) =>
      ImportJobSummarySchema.parse(d),
    );
  }

  createJob(shopId: string, fileName: string, opId: string) {
    return this.call(
      this.client.rpc('create_import_job', {
        p_shop_id: shopId,
        p_file_name: fileName,
        p_client_operation_id: opId,
      }),
      (d) => ImportJobSummarySchema.parse(d),
    );
  }

  stageRows(jobId: string, rows: ImportRowInput[]) {
    return this.call(this.client.rpc('stage_import_rows', { p_job_id: jobId, p_rows: rows }), (d) =>
      ImportJobSummarySchema.parse(d),
    );
  }

  // RLS limits this read to members with product.manage.
  listProblemRows(jobId: string, limit: number) {
    return this.call(
      this.client
        .from('import_job_rows')
        .select('id, row_number, raw, errors, action')
        .eq('job_id', jobId)
        .eq('skipped_by_user', false)
        .not('errors', 'eq', '{}')
        .order('row_number')
        .limit(limit),
      (d) => z.array(RowRecordSchema).parse(d),
    );
  }

  updateRow(rowId: string, patch: Partial<Record<ImportField, string>>, skip?: boolean) {
    return this.call(
      this.client.rpc('update_import_row', {
        p_row_id: rowId,
        p_patch: patch,
        ...(skip !== undefined ? { p_skip: skip } : {}),
      }),
      (d) => ImportJobSummarySchema.parse(d),
    );
  }

  commit(jobId: string, opId: string) {
    return this.call(
      this.client.rpc('commit_product_import', { p_job_id: jobId, p_client_operation_id: opId }),
      (d) => CommitImportOutputSchema.parse(d),
    );
  }

  cancel(jobId: string) {
    return this.call(this.client.rpc('cancel_import_job', { p_job_id: jobId }), () => {});
  }
}
