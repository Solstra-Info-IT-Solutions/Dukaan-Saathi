import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { StockCountScreen } from '@/features/inventory';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function StockCountRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  if (!features || !shopId) return null;
  return (
    <RequirePermission permission="stock.adjust">
      <StockCountScreen deps={features.inventory} shopId={shopId} onDone={() => router.back()} />
    </RequirePermission>
  );
}
