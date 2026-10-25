import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import { type RangePreset, rangeFor, type ReportGroup } from '../../domain/entities/Reports';
import type {
  CsvLabels,
  ExportSalesReport,
  GetDashboard,
  GetSalesReport,
} from '../../domain/usecases/reportsUseCases';

export { type CsvLabels, money } from '../../domain/usecases/reportsUseCases';

export interface ReportsViewModelDeps {
  getDashboard: GetDashboard;
  getSalesReport: GetSalesReport;
  exportReport: ExportSalesReport;
  now?: () => Date;
}

export const reportsKeys = {
  dashboard: (shopId: string, date: string) => ['reports', shopId, 'dashboard', date] as const,
  report: (shopId: string, from: string, to: string, group: string) =>
    ['reports', shopId, 'report', from, to, group] as const,
};

/** Today's dashboard plus a sales report for a range and grouping; CSV export within the plan's quota. */
export function useReportsViewModel(deps: ReportsViewModelDeps, shopId: string, canViewReports: boolean) {
  const [preset, setPreset] = useState<RangePreset>('today');
  const [groupBy, setGroupBy] = useState<ReportGroup>('day');
  const [exporting, setExporting] = useState(false);
  const [messageKey, setMessageKey] = useState<string | null>(null);
  const [messageParams, setMessageParams] = useState<Record<string, string | number>>({});
  const busy = useRef(false);

  const now = deps.now?.() ?? new Date();
  const today = rangeFor('today', now).to;
  const range = useMemo(() => rangeFor(preset, deps.now?.() ?? new Date()), [deps, preset]);

  const dashboard = useQuery({
    queryKey: reportsKeys.dashboard(shopId, today),
    queryFn: () => deps.getDashboard.execute(shopId, today),
  });
  const report = useQuery({
    queryKey: reportsKeys.report(shopId, range.from, range.to, groupBy),
    queryFn: () => deps.getSalesReport.execute(shopId, range, groupBy),
    enabled: canViewReports,
    retry: false,
  });

  const exportCsv = useCallback(
    async (labels: CsvLabels) => {
      if (busy.current || !report.data) return;
      busy.current = true;
      setExporting(true);
      setMessageKey(null);
      try {
        const usage = await deps.exportReport.execute(shopId, report.data, labels);
        setMessageKey(usage.limit === null ? 'reports.exported' : 'reports.exportedQuota');
        setMessageParams({ used: usage.used, limit: usage.limit ?? 0 });
      } catch (error) {
        setMessageKey(translateError(error).messageKey);
        setMessageParams({});
      } finally {
        busy.current = false;
        setExporting(false);
      }
    },
    [deps, report.data, shopId],
  );

  const reportError = report.isError ? translateError(report.error) : null;

  return {
    state: {
      preset,
      groupBy,
      range,
      dashboard: dashboard.data ?? null,
      dashboardLoading: dashboard.isPending,
      dashboardErrorKey: dashboard.isError ? translateError(dashboard.error).messageKey : null,
      report: report.data ?? null,
      reportLoading: canViewReports && report.isFetching,
      /** A plan without advanced reports: show an upgrade message instead of an error. */
      needsUpgrade: reportError?.code === 'DS_ENTITLEMENT_REQUIRED',
      reportErrorKey:
        reportError && reportError.code !== 'DS_ENTITLEMENT_REQUIRED' ? reportError.messageKey : null,
      exporting,
      messageKey,
      messageParams,
    },
    actions: {
      setPreset: (p: RangePreset) => {
        setMessageKey(null);
        setPreset(p);
      },
      setGroupBy: (g: ReportGroup) => {
        setMessageKey(null);
        setGroupBy(g);
      },
      refresh: () => {
        void dashboard.refetch();
        if (canViewReports) void report.refetch();
      },
      exportCsv,
    },
  };
}
