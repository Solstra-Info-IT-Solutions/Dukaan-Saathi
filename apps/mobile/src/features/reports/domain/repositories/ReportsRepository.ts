import type {
  CloseDayCommand,
  DashboardSnapshot,
  DateRange,
  DayClose,
  ReportGroup,
  SalesReport,
} from '../entities/Reports';

export interface ReportsRepository {
  getDashboard(shopId: string, businessDate: string | null): Promise<DashboardSnapshot>;
  getSalesReport(shopId: string, range: DateRange, groupBy: ReportGroup): Promise<SalesReport>;
  /** Checks the export entitlement and counts the export against the monthly quota. */
  beginExport(shopId: string): Promise<{ used: number; limit: number | null }>;
  getDayClose(shopId: string, deviceId: string): Promise<DayClose>;
  /** Safe to repeat with the same command. */
  closeDay(command: CloseDayCommand): Promise<DayClose>;
}
