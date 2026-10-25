import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AppError } from '@/core/errors/AppError';
import { SHOP_A } from '../../../../tests/fakes/shops';
import { renderHookWithQuery, renderWithProviders } from '../../../../tests/renderWithProviders';
import {
  type CloseDayCommand,
  type DashboardSnapshot,
  type DateRange,
  type DayClose,
  type FileSharer,
  istDate,
  rangeDays,
  rangeFor,
  type ReportGroup,
  type SalesReport,
} from '../domain/entities/Reports';
import type { ReportsRepository } from '../domain/repositories/ReportsRepository';
import {
  CloseDay,
  ExportSalesReport,
  GetDashboard,
  GetDayClose,
  GetSalesReport,
  reportCsv,
} from '../domain/usecases/reportsUseCases';
import { DayCloseScreen } from '../presentation/screens/DayCloseScreen';
import { ReportsScreen } from '../presentation/screens/ReportsScreen';
import { useDayCloseViewModel } from '../presentation/viewmodels/useDayCloseViewModel';

const DEVICE = '0190f0f0-0000-7000-8000-0000000000d1';
const NOW = new Date('2026-10-25T05:30:00.000Z');

/** The same seeded day as supabase/tests/database/012_reports_expenses.test.sql. */
const DASHBOARD: DashboardSnapshot = {
  scope: 'shop',
  businessDate: '2026-10-25',
  salesPaise: 15000,
  bills: 3,
  voidedBills: 1,
  discountPaise: 0,
  taxPaise: 0,
  udhaarGivenPaise: 0,
  returnsPaise: 4500,
  netSalesPaise: 10500,
  expensesPaise: 10300,
  payments: { cash: 10000, upi: 5000 },
  refunds: { cash: 4500 },
  profit: { profitPaise: 1000, linesWithCost: 1, lines: 3 },
};
const REPORT: SalesReport = {
  from: '2026-10-25',
  to: '2026-10-25',
  groupBy: 'product',
  rows: [
    {
      key: 'p1',
      label: 'Sugar, 1kg "loose"',
      salesPaise: 9000,
      quantityMilli: 2000,
      bills: 1,
      profitPaise: 1000,
    },
    { key: 'quick', label: 'quick', salesPaise: 6000, quantityMilli: null, bills: 2, profitPaise: 0 },
  ],
  totals: { salesPaise: 15000, bills: 3, returnsPaise: 4500, expensesPaise: 10300 },
};

class FakeReportsRepository implements ReportsRepository {
  dashboard: DashboardSnapshot = DASHBOARD;
  reportCalls: { range: DateRange; groupBy: ReportGroup }[] = [];
  reportError: unknown = null;
  exportError: unknown = null;
  exports = 0;
  closes: CloseDayCommand[] = [];
  day: DayClose = {
    businessDate: '2026-10-25',
    closed: false,
    breakdown: {
      openingCashPaise: 0,
      cashSalesPaise: 9000,
      cashRefundsPaise: 4500,
      cashExpensesPaise: 300,
      expectedCashPaise: 4200,
    },
    countedCashPaise: null,
    differencePaise: null,
    closedAt: null,
    note: null,
  };
  async getDashboard() {
    return this.dashboard;
  }
  async getSalesReport(_shopId: string, range: DateRange, groupBy: ReportGroup) {
    this.reportCalls.push({ range, groupBy });
    if (this.reportError) throw this.reportError;
    return { ...REPORT, from: range.from, to: range.to, groupBy };
  }
  async beginExport() {
    if (this.exportError) throw this.exportError;
    this.exports += 1;
    return { used: this.exports, limit: 20 };
  }
  async getDayClose() {
    return this.day;
  }
  async closeDay(command: CloseDayCommand) {
    this.closes.push(command);
    const b = { ...this.day.breakdown, openingCashPaise: command.openingCashPaise };
    b.expectedCashPaise = b.openingCashPaise + b.cashSalesPaise - b.cashRefundsPaise - b.cashExpensesPaise;
    this.day = {
      ...this.day,
      closed: true,
      breakdown: b,
      countedCashPaise: command.countedCashPaise,
      differencePaise: command.countedCashPaise - b.expectedCashPaise,
      closedAt: NOW.toISOString(),
    };
    return this.day;
  }
}

let ids = 0;
const newId = () => `0190f0f0-0000-7000-8000-${String(++ids).padStart(12, '0')}`;

function reportsDeps(
  repo: FakeReportsRepository,
  sharer: FileSharer = { shareText: jest.fn(async () => {}) },
) {
  return {
    getDashboard: new GetDashboard(repo),
    getSalesReport: new GetSalesReport(repo),
    exportReport: new ExportSalesReport(repo, sharer),
    now: () => NOW,
  };
}

describe('report dates and CSV', () => {
  it('uses the shop day in India for ranges', () => {
    expect(istDate(new Date('2026-10-25T19:00:00Z'))).toBe('2026-10-26');
    expect(rangeFor('today', NOW)).toEqual({ from: '2026-10-25', to: '2026-10-25' });
    expect(rangeFor('week', NOW)).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(rangeFor('month', NOW)).toEqual({ from: '2026-10-01', to: '2026-10-25' });
    expect(rangeDays(rangeFor('week', NOW))).toBe(7);
  });

  it('builds a CSV with plain rupee numbers and quoted text', () => {
    const csv = reportCsv(REPORT, {
      header: ['Item', 'Sales', 'Bills', 'Qty', 'Returns', 'Net', 'Profit'],
      label: (r) => r.label,
    });
    expect(csv.split('\n')).toEqual([
      'Item,Sales,Bills,Qty,Returns,Net,Profit',
      '"Sugar, 1kg ""loose""",90.00,1,2,,,10.00',
      'quick,60.00,2,,,,0.00',
      '',
    ]);
  });

  it('export counts against the quota before sharing, and does not share when refused', async () => {
    const repo = new FakeReportsRepository();
    const sharer = { shareText: jest.fn(async () => {}) };
    const exportReport = new ExportSalesReport(repo, sharer);
    expect(await exportReport.execute(SHOP_A, REPORT, { header: [], label: (r) => r.label })).toEqual({
      used: 1,
      limit: 20,
    });
    expect(sharer.shareText).toHaveBeenCalledWith(
      'sales-product-2026-10-25-to-2026-10-25.csv',
      'text/csv',
      expect.any(String),
    );
    repo.exportError = new AppError('DS_QUOTA_EXCEEDED');
    await expect(
      exportReport.execute(SHOP_A, REPORT, { header: [], label: (r) => r.label }),
    ).rejects.toMatchObject({
      code: 'DS_QUOTA_EXCEEDED',
    });
    expect(sharer.shareText).toHaveBeenCalledTimes(1);
  });
});

describe('ReportsScreen', () => {
  it("shows today's numbers and a report; breakdowns ask for an upgrade on a basic plan", async () => {
    const repo = new FakeReportsRepository();
    await renderWithProviders(
      <ReportsScreen deps={reportsDeps(repo)} shopId={SHOP_A} canViewReports canExport />,
    );
    expect(await screen.findByText('₹150.00')).toBeTruthy();
    expect(screen.getAllByText('₹105.00').length).toBeGreaterThan(0); // net after returns (card and report total)
    expect(screen.getByText('Profit (estimate, 33% of items have a cost)')).toBeTruthy();
    await waitFor(() =>
      expect(repo.reportCalls[0]).toMatchObject({ groupBy: 'day', range: { from: '2026-10-25' } }),
    );
    repo.reportError = new AppError('DS_ENTITLEMENT_REQUIRED');
    await fireEvent.press(screen.getByText('Staff'));
    expect(await screen.findByText(/need a plan with advanced reports/)).toBeTruthy();
  });

  it('a cashier sees only their own sales and no report', async () => {
    const repo = new FakeReportsRepository();
    repo.dashboard = { scope: 'own', businessDate: '2026-10-25', salesPaise: 1000, bills: 1 };
    await renderWithProviders(
      <ReportsScreen deps={reportsDeps(repo)} shopId={SHOP_A} canViewReports={false} canExport={false} />,
    );
    expect(await screen.findByText('These are your own bills today.')).toBeTruthy();
    expect(screen.queryByText('Sales report')).toBeNull();
    expect(repo.reportCalls).toHaveLength(0);
  });
});

describe('day close', () => {
  const deps = (repo: FakeReportsRepository) => ({
    getDayClose: new GetDayClose(repo),
    closeDay: new CloseDay(repo),
    newId,
  });

  it('computes expected cash and the difference while typing, then stores the closing once', async () => {
    const repo = new FakeReportsRepository();
    const { result } = await renderHookWithQuery(() => useDayCloseViewModel(deps(repo), SHOP_A, DEVICE));
    await waitFor(() => expect(result.current.state.loading).toBe(false));
    await act(async () => result.current.actions.setOpeningText('10'));
    await act(async () => result.current.actions.setCountedText('50'));
    expect(result.current.state.expected).toBe(5200);
    expect(result.current.state.difference).toBe(-200);
    await act(async () => {
      await Promise.all([result.current.actions.close(), result.current.actions.close()]);
    });
    expect(repo.closes).toHaveLength(1);
    expect(repo.closes[0]).toMatchObject({
      openingCashPaise: 1000,
      countedCashPaise: 5000,
      businessDate: '2026-10-25',
    });
    expect(result.current.state.day?.closed).toBe(true);
  });

  it('needs the counted cash; the screen shows a closed day', async () => {
    const repo = new FakeReportsRepository();
    await renderWithProviders(<DayCloseScreen deps={deps(repo)} shopId={SHOP_A} deviceId={DEVICE} />);
    await fireEvent.press(await screen.findByText('Close the day'));
    expect(await screen.findByText('Count the cash and enter the amount.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Cash counted (₹)'), '42');
    expect(await screen.findByText('Cash matches.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Close the day'));
    expect(await screen.findByText('This day is closed on this phone.')).toBeTruthy();
  });
});
