import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { catalogueKeys } from '@/features/catalogue';
import { PurchaseFormScreen } from '@/features/purchases';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function NewPurchaseRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { supplierId } = useLocalSearchParams<{ supplierId?: string }>();
  const shop = useSessionStore((s) => s.activeShop);
  if (!features || !shop) return null;
  return (
    <RequirePermission permission="purchase.receive">
      <PurchaseFormScreen
        key={supplierId ?? 'none'}
        deps={{
          ...features.purchases,
          // Stock and prices changed: refresh the catalogue and stock screens.
          onReceived: () => {
            void queryClient.invalidateQueries({ queryKey: catalogueKeys.all(shop.shopId) });
            void queryClient.invalidateQueries({ queryKey: ['inventory', shop.shopId] });
          },
        }}
        shopId={shop.shopId}
        deviceId={shop.deviceId}
        supplierId={supplierId ?? null}
        onDone={() => router.back()}
      />
    </RequirePermission>
  );
}
