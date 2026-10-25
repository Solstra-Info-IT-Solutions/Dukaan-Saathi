import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { DayCloseScreen } from '@/features/reports';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function DayCloseRoute() {
  const { features } = useDependencies();
  const shop = useSessionStore((s) => s.activeShop);
  if (!features || !shop) return null;
  return (
    <RequirePermission permission="day.close">
      <DayCloseScreen deps={features.reports} shopId={shop.shopId} deviceId={shop.deviceId} />
    </RequirePermission>
  );
}
