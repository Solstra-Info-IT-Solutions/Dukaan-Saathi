import type { ImportField } from '@ds/domain-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type { CsvFileSource, ImportCommitResult, ImportJobSummary } from '../../domain/entities/Import';
import {
  type CommitImport,
  type FixImportRow,
  type GetImportJob,
  ImportInputError,
  type ListProblemRows,
  type PreviewCsvImport,
  type SkipImportRow,
} from '../../domain/usecases/importUseCases';

export interface ImportViewModelDeps {
  fileSource: CsvFileSource;
  previewImport: PreviewCsvImport;
  listProblemRows: ListProblemRows;
  fixRow: FixImportRow;
  skipRow: SkipImportRow;
  commitImport: CommitImport;
  getImportJob: GetImportJob;
  newId: () => string;
  /** Called after a successful commit so catalogue caches can refresh. */
  onCommitted?: () => void;
}

export type ImportPhase = 'idle' | 'reading' | 'review' | 'committing' | 'committed';
export type RowEdits = Record<string, Partial<Record<ImportField, string>>>;

export const importKeys = { problems: (jobId: string) => ['imports', jobId, 'problems'] as const };

/**
 * CSV import: pick → parse and stage (server validates) → fix or skip problem rows → commit once.
 * The commit operation id is created once per job, so a retried commit cannot import twice.
 */
/** `initialJobId`: open an import our team prepared (managed onboarding) instead of picking a file. */
export function useImportViewModel(deps: ImportViewModelDeps, shopId: string, initialJobId?: string) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<ImportPhase>(initialJobId ? 'reading' : 'idle');
  const [summary, setSummary] = useState<ImportJobSummary | null>(null);
  const [unmappedHeaders, setUnmapped] = useState<string[]>([]);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorParams, setErrorParams] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<RowEdits>({});
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const commitOpId = useRef<{ jobId: string; opId: string } | null>(null);
  const busy = useRef(false);

  const jobId = summary?.jobId ?? null;
  const problems = useQuery({
    queryKey: importKeys.problems(jobId ?? 'none'),
    queryFn: () => deps.listProblemRows.execute(jobId as string),
    enabled: jobId !== null && phase === 'review' && (summary?.errorCount ?? 0) > 0,
  });

  const fail = useCallback((error: unknown) => {
    if (error instanceof ImportInputError) {
      setErrorKey(`imports.errors.${error.reason}`);
      setErrorParams({ columns: error.missing.join(', ') });
    } else {
      setErrorKey(translateError(error).messageKey);
      setErrorParams({});
    }
  }, []);

  // Loads once per job id; callers may pass a fresh deps object on every render.
  const getImportJob = useRef(deps.getImportJob);
  useEffect(() => {
    if (!initialJobId) return;
    let live = true;
    getImportJob.current
      .execute(initialJobId)
      .then((job) => {
        if (!live) return;
        if (job.status === 'committed' || job.status === 'cancelled') {
          setErrorKey('imports.errors.NOT_OPEN');
          setPhase('idle');
          return;
        }
        setSummary(job);
        setUnmapped([]);
        setPhase('review');
      })
      .catch((error: unknown) => {
        if (!live) return;
        fail(error);
        setPhase('idle');
      });
    return () => {
      live = false;
    };
  }, [fail, initialJobId]);

  const pickFile = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setErrorKey(null);
    try {
      const file = await deps.fileSource.pick();
      if (!file) return;
      setPhase('reading');
      const preview = await deps.previewImport.execute(shopId, file);
      setSummary(preview.summary);
      setUnmapped(preview.unmappedHeaders);
      setEdits({});
      setPhase('review');
    } catch (error) {
      fail(error);
      setPhase((p) => (p === 'reading' ? 'idle' : p));
    } finally {
      busy.current = false;
    }
  }, [deps, shopId, fail]);

  const afterRowChange = useCallback(
    async (next: ImportJobSummary, rowId: string) => {
      setSummary(next);
      setEdits(({ [rowId]: _done, ...rest }) => rest);
      await queryClient.invalidateQueries({ queryKey: importKeys.problems(next.jobId) });
    },
    [queryClient],
  );

  const runRow = useCallback(
    async (rowId: string, work: () => Promise<ImportJobSummary>) => {
      if (busy.current) return;
      busy.current = true;
      setBusyRowId(rowId);
      setErrorKey(null);
      try {
        await afterRowChange(await work(), rowId);
      } catch (error) {
        fail(error);
      } finally {
        busy.current = false;
        setBusyRowId(null);
      }
    },
    [afterRowChange, fail],
  );

  const commit = useCallback(async () => {
    if (busy.current || !summary || summary.errorCount > 0) return;
    busy.current = true;
    setErrorKey(null);
    setPhase('committing');
    if (commitOpId.current?.jobId !== summary.jobId) {
      commitOpId.current = { jobId: summary.jobId, opId: deps.newId() };
    }
    try {
      setResult(await deps.commitImport.execute(summary.jobId, commitOpId.current.opId));
      setPhase('committed');
      deps.onCommitted?.();
    } catch (error) {
      fail(error);
      setPhase('review');
    } finally {
      busy.current = false;
    }
  }, [deps, summary, fail]);

  return {
    state: {
      phase,
      summary,
      unmappedHeaders,
      problemRows: problems.data ?? [],
      loadingRows: problems.isFetching,
      edits,
      busyRowId,
      result,
      errorKey,
      errorParams,
      canCommit: phase === 'review' && !!summary && summary.errorCount === 0 && summary.validCount > 0,
    },
    actions: {
      pickFile,
      setEdit: (rowId: string, field: ImportField, value: string) =>
        setEdits((e) => ({ ...e, [rowId]: { ...e[rowId], [field]: value } })),
      saveRow: (rowId: string) => runRow(rowId, () => deps.fixRow.execute(rowId, edits[rowId] ?? {})),
      skipRow: (rowId: string) => runRow(rowId, () => deps.skipRow.execute(rowId)),
      commit,
      startOver: () => {
        setPhase('idle');
        setSummary(null);
        setResult(null);
        setErrorKey(null);
        setEdits({});
      },
    },
  };
}
