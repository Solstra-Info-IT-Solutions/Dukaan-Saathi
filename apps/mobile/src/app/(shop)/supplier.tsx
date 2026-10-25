import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useHasPermission, useSessionStore } from '@/core/session/sessionStore';
import { SupplierDetailScreen } from '@/features/purchases';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function SupplierRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const shop = useSessionStore((s) => s.activeShop);
  const canPay = useHasPermission('purchase.pay');
  const canReceive = useHasPermission('purchase.receive');
  if (!features || !shop || !id) return null;
  return (
    <RequirePermission permission="purchase.view">
      <SupplierDetailScreen
        key={id}
        deps={features.purchases}
        shopId={shop.shopId}
        deviceId={shop.deviceId}
        supplierId={id}
        canPay={canPay}
        canReceive={canReceive}
        onNewPurchase={(supplierId) => router.push({ pathname: '/purchase-new', params: { supplierId } })}
      />
    </RequirePermission>
  );
}
