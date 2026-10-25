import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useHasPermission, useSessionStore } from '@/core/session/sessionStore';
import { ReportsScreen } from '@/features/reports';

export default function ReportsRoute() {
  const { features } = useDependencies();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  const canViewReports = useHasPermission('report.view_sales');
  const canExport = useHasPermission('report.export');
  if (!features || !shopId) return null;
  return (
    <ReportsScreen
      deps={features.reports}
      shopId={shopId}
      canViewReports={canViewReports}
      canExport={canExport}
    />
  );
}
