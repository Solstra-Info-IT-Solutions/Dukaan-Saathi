import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { hasPermission, useSessionStore } from '@/core/session/sessionStore';
import { type BillingContext, BillingScreen } from '@/features/billing';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function BillRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shop = useSessionStore((s) => s.activeShop);
  const context = useMemo<BillingContext | null>(
    () =>
      shop && {
        shopId: shop.shopId,
        shopName: shop.shopName,
        role: shop.role,
        canDiscount: hasPermission(shop, 'sale.discount'),
        deviceId: shop.deviceId,
        fy: shop.fy,
        lastSeq: shop.lastSeq,
      },
    [shop],
  );
  if (!features || !context) return null;
  return (
    <RequirePermission permission="sale.create">
      <BillingScreen
        deps={features.billing}
        context={context}
        onCompleted={(saleId) => router.push({ pathname: '/receipt', params: { saleId } })}
      />
    </RequirePermission>
  );
}
