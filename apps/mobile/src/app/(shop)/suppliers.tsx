import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useHasPermission, useSessionStore } from '@/core/session/sessionStore';
import { SuppliersScreen } from '@/features/purchases';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function SuppliersRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  const canManage = useHasPermission('purchase.manage');
  const canReceive = useHasPermission('purchase.receive');
  if (!features || !shopId) return null;
  return (
    <RequirePermission permission="purchase.view">
      <SuppliersScreen
        deps={features.purchases}
        shopId={shopId}
        canManage={canManage}
        canReceive={canReceive}
        onOpen={(id) => router.push({ pathname: '/supplier', params: { id } })}
        onAdd={() => router.push('/supplier-new')}
        onNewPurchase={() => router.push('/purchase-new')}
      />
    </RequirePermission>
  );
}
