import { formatPaise, formatQuantity, paise, quantityMilli } from '@ds/domain-core';
import type {
  CloseDayCommand,
  DashboardSnapshot,
  DateRange,
  DayClose,
  FileSharer,
  ReportGroup,
  SalesReport,
} from '../entities/Reports';
import type { ReportsRepository } from '../repositories/ReportsRepository';

export class GetDashboard {
  constructor(private readonly reports: ReportsRepository) {}
  execute(shopId: string, businessDate: string | null = null): Promise<DashboardSnapshot> {
    return this.reports.getDashboard(shopId, businessDate);
  }
}

export class GetSalesReport {
  constructor(private readonly reports: ReportsRepository) {}
  execute(shopId: string, range: DateRange, groupBy: ReportGroup): Promise<SalesReport> {
    return this.reports.getSalesReport(shopId, range, groupBy);
  }
}

export interface CsvLabels {
  header: string[];
  label: (row: SalesReport['rows'][number]) => string;
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** Rupees with two decimals and no symbol or grouping, so spreadsheets read them as numbers. */
const rupees = (p: number | undefined | null) => (p === undefined || p === null ? '' : (p / 100).toFixed(2));

/** CSV of a sales report (pure). Columns: label, sales, bills, quantity, returns, net, profit. */
export function reportCsv(report: SalesReport, labels: CsvLabels): string {
  const lines = [labels.header.map(csvCell).join(',')];
  for (const row of report.rows) {
    lines.push(
      [
        labels.label(row),
        rupees(row.salesPaise),
        row.bills === undefined ? '' : String(row.bills),
        row.quantityMilli === undefined || row.quantityMilli === null
          ? ''
          : formatQuantity(quantityMilli(row.quantityMilli)),
        rupees(row.returnsPaise),
        rupees(row.netPaise),
        rupees(row.profitPaise),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Export: the server checks the plan and monthly quota first, then the phone builds and shares the CSV. */
export class ExportSalesReport {
  constructor(
    private readonly reports: ReportsRepository,
    private readonly sharer: FileSharer,
  ) {}

  async execute(shopId: string, report: SalesReport, labels: CsvLabels) {
    const usage = await this.reports.beginExport(shopId);
    const name = `sales-${report.groupBy}-${report.from}-to-${report.to}.csv`;
    await this.sharer.shareText(name, 'text/csv', reportCsv(report, labels));
    return usage;
  }
}

export class GetDayClose {
  constructor(private readonly reports: ReportsRepository) {}
  execute(shopId: string, deviceId: string): Promise<DayClose> {
    return this.reports.getDayClose(shopId, deviceId);
  }
}

export class DayCloseInputError extends Error {
  constructor(readonly reason: 'COUNTED_REQUIRED' | 'INVALID_OPENING') {
    super(reason);
    this.name = 'DayCloseInputError';
  }
}

export class CloseDay {
  constructor(private readonly reports: ReportsRepository) {}
  async execute(
    command: Omit<CloseDayCommand, 'countedCashPaise' | 'openingCashPaise'> & {
      countedCashPaise: number | null;
      openingCashPaise: number | null;
    },
  ): Promise<DayClose> {
    if (command.countedCashPaise === null) throw new DayCloseInputError('COUNTED_REQUIRED');
    if (command.openingCashPaise === null) throw new DayCloseInputError('INVALID_OPENING');
    return this.reports.closeDay({
      ...command,
      countedCashPaise: command.countedCashPaise,
      openingCashPaise: command.openingCashPaise,
    });
  }
}

/** Expected cash for a typed opening amount (the server stores the same sum). */
export function expectedCash(breakdown: DayClose['breakdown'], openingPaise: number): number {
  return openingPaise + breakdown.cashSalesPaise - breakdown.cashRefundsPaise - breakdown.cashExpensesPaise;
}

export const money = (p: number) => formatPaise(paise(p));
