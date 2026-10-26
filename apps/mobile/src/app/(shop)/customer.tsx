import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useHasPermission, useSessionStore } from '@/core/session/sessionStore';
import { CustomerLedgerScreen } from '@/features/customers';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function CustomerRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const shop = useSessionStore((s) => s.activeShop);
  const canCollect = useHasPermission('udhaar.collect');
  const canAdjust = useHasPermission('udhaar.adjust');
  if (!features || !shop || !id) return null;
  return (
    <RequirePermission permission="customer.view">
      <CustomerLedgerScreen
        key={id}
        deps={features.customers}
        shop={{ shopId: shop.shopId, shopName: shop.shopName, deviceId: shop.deviceId }}
        customerId={id}
        canCollect={canCollect}
        canAdjust={canAdjust}
        onOpenSale={(saleId) => router.push({ pathname: '/receipt', params: { saleId } })}
      />
    </RequirePermission>
  );
}
