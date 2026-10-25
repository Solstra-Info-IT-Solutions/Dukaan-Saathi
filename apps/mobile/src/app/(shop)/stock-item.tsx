import { useLocalSearchParams } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useHasPermission, useSessionStore } from '@/core/session/sessionStore';
import { StockItemScreen } from '@/features/inventory';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function StockItemRoute() {
  const { features } = useDependencies();
  const { productId } = useLocalSearchParams<{ productId?: string }>();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  const canAdjust = useHasPermission('stock.adjust');
  if (!features || !shopId || !productId) return null;
  return (
    <RequirePermission permission="stock.view">
      <StockItemScreen
        key={productId}
        deps={features.inventory}
        shopId={shopId}
        productId={productId}
        canAdjust={canAdjust}
      />
    </RequirePermission>
  );
}
