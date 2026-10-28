import type { ImportField, ImportRowInput } from '@ds/domain-core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AppError } from '@/core/errors/AppError';
import { SHOP_A } from '../../../../tests/fakes/shops';
import { renderHookWithQuery, renderWithProviders } from '../../../../tests/renderWithProviders';
import type { ImportJobSummary, ImportRow, PickedFile } from '../domain/entities/Import';
import type { ImportRepository } from '../domain/repositories/ImportRepository';
import {
  CommitImport,
  FixImportRow,
  GetImportJob,
  ImportInputError,
  ListProblemRows,
  PreviewCsvImport,
  SkipImportRow,
  STAGE_BATCH_SIZE,
} from '../domain/usecases/importUseCases';
import { ImportScreen } from '../presentation/screens/ImportScreen';
import { useImportViewModel } from '../presentation/viewmodels/useImportViewModel';

const JOB = '0190f0f0-0000-7000-8000-0000000000f9';
const OP = '0190f0f0-0000-7000-8000-0000000000fa';

/** Simulates the server: validates name + price, tracks skipped rows. */
class FakeImportRepository implements ImportRepository {
  rows: (ImportRow & { skipped: boolean })[] = [];
  stageCalls = 0;
  commits: string[] = [];
  commitError: unknown = null;
  jobStatus: ImportJobSummary['status'] = 'review';

  private summary(): ImportJobSummary {
    const active = this.rows.filter((r) => !r.skipped);
    const errors = active.filter((r) => r.errors.length > 0);
    return {
      jobId: JOB,
      status: this.jobStatus,
      fileName: 'items.csv',
      rowCount: this.rows.length,
      validCount: active.length - errors.length,
      errorCount: errors.length,
      createCount: active.length - errors.length,
      updateCount: 0,
      skipCount: this.rows.length - active.length,
      committedAt: null,
    };
  }
  private validate(raw: ImportRow['raw']): string[] {
    const errors: string[] = [];
    if (!raw.name) errors.push('REQUIRED_NAME');
    if (!/^\d+(\.\d{1,2})?$/.test(raw.price ?? '')) errors.push('INVALID_PRICE');
    return errors;
  }
  async getJob() {
    return this.summary();
  }
  async createJob() {
    return this.summary();
  }
  async stageRows(_jobId: string, rows: ImportRowInput[]) {
    this.stageCalls += 1;
    for (const { rowNumber, ...raw } of rows) {
      this.rows.push({
        rowId: `r${rowNumber}`,
        rowNumber,
        raw,
        errors: this.validate(raw),
        action: 'create',
        skipped: false,
      });
    }
    return this.summary();
  }
  async listProblemRows() {
    return this.rows.filter((r) => !r.skipped && r.errors.length > 0);
  }
  async updateRow(rowId: string, patch: Partial<Record<ImportField, string>>, skip?: boolean) {
    const row = this.rows.find((r) => r.rowId === rowId)!;
    row.raw = { ...row.raw, ...patch };
    row.errors = this.validate(row.raw);
    if (skip !== undefined) row.skipped = skip;
    return this.summary();
  }
  async commit(_jobId: string, opId: string) {
    this.commits.push(opId);
    if (this.commitError) throw this.commitError;
    return { jobId: JOB, created: this.summary().createCount, updated: 0 };
  }
  async cancel() {}
}

const csv = 'Item Name,Price,Unit\nSugar,45,kg\nSalt,abc,pc\n,10,\n';

function deps(repo: FakeImportRepository, file: PickedFile | null = { name: 'items.csv', text: csv }) {
  return {
    fileSource: { pick: async () => file },
    previewImport: new PreviewCsvImport(repo, () => OP),
    listProblemRows: new ListProblemRows(repo),
    fixRow: new FixImportRow(repo),
    skipRow: new SkipImportRow(repo),
    commitImport: new CommitImport(repo),
    getImportJob: new GetImportJob(repo),
    newId: () => OP,
  };
}

describe('PreviewCsvImport', () => {
  it('rejects files without the required columns', async () => {
    const repo = new FakeImportRepository();
    await expect(
      new PreviewCsvImport(repo, () => OP).execute(SHOP_A, { name: 'x.csv', text: 'Product,MRP\nA,1' }),
    ).rejects.toMatchObject({ reason: 'MISSING_COLUMNS', missing: ['price'] });
    await expect(
      new PreviewCsvImport(repo, () => OP).execute(SHOP_A, { name: 'x.csv', text: '  ' }),
    ).rejects.toBeInstanceOf(ImportInputError);
  });
  it('stages large files in batches', async () => {
    const repo = new FakeImportRepository();
    const lines = [
      'name,price',
      ...Array.from({ length: STAGE_BATCH_SIZE + 3 }, (_, i) => `Item ${i},${i + 1}`),
    ];
    const preview = await new PreviewCsvImport(repo, () => OP).execute(SHOP_A, {
      name: 'big.csv',
      text: lines.join('\n'),
    });
    expect(repo.stageCalls).toBe(2);
    expect(preview.summary.rowCount).toBe(STAGE_BATCH_SIZE + 3);
  });
});

describe('useImportViewModel', () => {
  it('picks, fixes, skips and commits once even when the commit is retried', async () => {
    const repo = new FakeImportRepository();
    const onCommitted = jest.fn();
    const { result } = await renderHookWithQuery(() =>
      useImportViewModel({ ...deps(repo), onCommitted }, SHOP_A),
    );
    await act(async () => result.current.actions.pickFile());
    expect(result.current.state.phase).toBe('review');
    expect(result.current.state.summary?.errorCount).toBe(2);
    await waitFor(() => expect(result.current.state.problemRows.map((r) => r.rowNumber)).toEqual([3, 4]));

    await act(async () => result.current.actions.setEdit('r3', 'price', '28'));
    await act(async () => result.current.actions.saveRow('r3'));
    await act(async () => result.current.actions.skipRow('r4'));
    expect(result.current.state.summary?.errorCount).toBe(0);
    expect(result.current.state.canCommit).toBe(true);

    repo.commitError = new AppError('NETWORK_TIMEOUT');
    await act(async () => result.current.actions.commit());
    expect(result.current.state.phase).toBe('review');
    expect(result.current.state.errorKey).toBe('errors.NETWORK_TIMEOUT');
    repo.commitError = null;
    await act(async () => result.current.actions.commit());
    expect(result.current.state.phase).toBe('committed');
    expect(result.current.state.result).toMatchObject({ created: 2 });
    expect(repo.commits).toEqual([OP, OP]);
    expect(onCommitted).toHaveBeenCalled();
  });

  it('stays idle when the picker is cancelled', async () => {
    const repo = new FakeImportRepository();
    const { result } = await renderHookWithQuery(() => useImportViewModel(deps(repo, null), SHOP_A));
    await act(async () => result.current.actions.pickFile());
    expect(result.current.state.phase).toBe('idle');
    expect(repo.stageCalls).toBe(0);
  });

  it('opens an import our team prepared and lets the owner commit it', async () => {
    const repo = new FakeImportRepository();
    await repo.stageRows(JOB, [
      { rowNumber: 2, name: 'Sugar', price: '45' },
      { rowNumber: 3, name: 'Tea', price: '120' },
    ]);
    const { result } = await renderHookWithQuery(() => useImportViewModel(deps(repo, null), SHOP_A, JOB));
    await waitFor(() => expect(result.current.state.phase).toBe('review'));
    expect(result.current.state.canCommit).toBe(true);
    await act(async () => result.current.actions.commit());
    expect(result.current.state.phase).toBe('committed');
    expect(repo.commits).toEqual([OP]);
  });

  it('says so when the prepared import was already added', async () => {
    const repo = new FakeImportRepository();
    repo.jobStatus = 'committed';
    const { result } = await renderHookWithQuery(() => useImportViewModel(deps(repo, null), SHOP_A, JOB));
    await waitFor(() => expect(result.current.state.errorKey).toBe('imports.errors.NOT_OPEN'));
    expect(result.current.state.phase).toBe('idle');
  });
});

describe('ImportScreen', () => {
  it('explains missing columns', async () => {
    const repo = new FakeImportRepository();
    await renderWithProviders(
      <ImportScreen
        deps={deps(repo, { name: 'x.csv', text: 'Product,MRP\nA,1' })}
        shopId={SHOP_A}
        onDone={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByText('Choose CSV file'));
    expect(await screen.findByText('Required columns are missing: price.')).toBeOnTheScreen();
  });

  it('shows problem rows with translated errors', async () => {
    const repo = new FakeImportRepository();
    await renderWithProviders(<ImportScreen deps={deps(repo)} shopId={SHOP_A} onDone={jest.fn()} />);
    await fireEvent.press(screen.getByText('Choose CSV file'));
    expect(await screen.findByText('Row 3: Salt')).toBeOnTheScreen();
    expect(screen.getByText('Price not a number')).toBeOnTheScreen();
    expect(screen.getByText('Name missing')).toBeOnTheScreen();
  });
});
