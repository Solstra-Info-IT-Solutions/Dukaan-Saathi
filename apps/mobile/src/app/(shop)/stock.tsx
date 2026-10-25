import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useHasPermission, useSessionStore } from '@/core/session/sessionStore';
import { StockScreen } from '@/features/inventory';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function StockRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  const canAdjust = useHasPermission('stock.adjust');
  if (!features || !shopId) return null;
  return (
    <RequirePermission permission="stock.view">
      <StockScreen
        deps={features.inventory}
        shopId={shopId}
        canAdjust={canAdjust}
        onOpenItem={(item) => router.push({ pathname: '/stock-item', params: { productId: item.productId } })}
        onCount={() => router.push('/stock-count')}
      />
    </RequirePermission>
  );
}
