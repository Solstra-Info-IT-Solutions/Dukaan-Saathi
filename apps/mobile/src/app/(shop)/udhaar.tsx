import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useHasPermission, useSessionStore } from '@/core/session/sessionStore';
import { UdhaarListScreen } from '@/features/customers';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function UdhaarRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  const canManage = useHasPermission('customer.manage');
  const canQuickAdd = useHasPermission('customer.quick_create');
  if (!features || !shopId) return null;
  return (
    <RequirePermission permission="customer.view">
      <UdhaarListScreen
        deps={features.customers}
        shopId={shopId}
        canAdd={canManage || canQuickAdd}
        onOpen={(id) => router.push({ pathname: '/customer', params: { id } })}
        onAdd={() => router.push('/customer-new')}
      />
    </RequirePermission>
  );
}
