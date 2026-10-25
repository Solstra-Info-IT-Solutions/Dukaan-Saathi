import { translateError } from '@/core/errors/translateError';
import type { CloseDayCommand, DateRange, ReportGroup } from '../../domain/entities/Reports';
import type { ReportsRepository } from '../../domain/repositories/ReportsRepository';
import type { SupabaseReportsDataSource } from '../datasources/remote/SupabaseReportsDataSource';

async function translated<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw translateError(e);
  }
}

export class ReportsRepositoryImpl implements ReportsRepository {
  constructor(private readonly remote: SupabaseReportsDataSource) {}

  getDashboard = (shopId: string, businessDate: string | null) =>
    translated(() => this.remote.getDashboard(shopId, businessDate));
  getSalesReport = (shopId: string, range: DateRange, groupBy: ReportGroup) =>
    translated(() => this.remote.getSalesReport(shopId, range.from, range.to, groupBy));
  beginExport = (shopId: string) => translated(() => this.remote.beginExport(shopId));
  getDayClose = (shopId: string, deviceId: string) =>
    translated(() => this.remote.getDayClose(shopId, deviceId));
  closeDay = (command: CloseDayCommand) => translated(() => this.remote.closeDay(command));
}
