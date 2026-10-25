// Public API of the reports feature (dashboard, sales report, day close).
export type { ReportsRepository } from './domain/repositories/ReportsRepository';
export type { FileSharer } from './domain/entities/Reports';
export {
  CloseDay,
  ExportSalesReport,
  GetDashboard,
  GetDayClose,
  GetSalesReport,
} from './domain/usecases/reportsUseCases';
export { ReportsRepositoryImpl } from './data/repositories/ReportsRepositoryImpl';
export { SupabaseReportsDataSource } from './data/datasources/remote/SupabaseReportsDataSource';
export { ReportsScreen } from './presentation/screens/ReportsScreen';
export { DayCloseScreen } from './presentation/screens/DayCloseScreen';
export type { ReportsViewModelDeps } from './presentation/viewmodels/useReportsViewModel';
export type { DayCloseViewModelDeps } from './presentation/viewmodels/useDayCloseViewModel';
