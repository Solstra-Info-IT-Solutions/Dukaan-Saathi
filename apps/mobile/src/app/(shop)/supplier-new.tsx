import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { SupplierFormScreen } from '@/features/purchases';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function NewSupplierRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  if (!features || !shopId) return null;
  return (
    <RequirePermission permission="purchase.manage">
      <SupplierFormScreen deps={features.purchases} shopId={shopId} onSaved={() => router.back()} />
    </RequirePermission>
  );
}
