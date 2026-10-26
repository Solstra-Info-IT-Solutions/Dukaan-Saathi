import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useHasPermission, useSessionStore } from '@/core/session/sessionStore';
import { CustomerFormScreen } from '@/features/customers';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function NewCustomerRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  const canManage = useHasPermission('customer.manage');
  if (!features || !shopId) return null;
  return (
    <RequirePermission permission="customer.quick_create">
      <CustomerFormScreen
        deps={features.customers}
        shopId={shopId}
        canManage={canManage}
        onSaved={(id) => router.replace({ pathname: '/customer', params: { id } })}
      />
    </RequirePermission>
  );
}
