import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { PlanScreen } from '@/features/subscription';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function PlanRoute() {
  const { features } = useDependencies();
  const shop = useSessionStore((s) => s.activeShop);
  if (!features || !shop) return null;
  return (
    <RequirePermission permission="subscription.view">
      <PlanScreen deps={features.subscription} shopId={shop.shopId} shopName={shop.shopName} />
    </RequirePermission>
  );
}
