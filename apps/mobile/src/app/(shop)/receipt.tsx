import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useHasPermission, useSessionStore } from '@/core/session/sessionStore';
import { ReceiptScreen } from '@/features/billing';

export default function ReceiptRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const { saleId } = useLocalSearchParams<{ saleId?: string }>();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  const deviceId = useSessionStore((s) => s.activeShop?.deviceId);
  const canReturn = useHasPermission('sale.return');
  const canVoid = useHasPermission('sale.void');
  if (!features || !shopId || !deviceId || !saleId) return null;
  return (
    <ReceiptScreen
      key={saleId}
      deps={features.billing}
      shopId={shopId}
      saleId={saleId}
      deviceId={deviceId}
      canVoid={canVoid}
      canReturn={canReturn}
      onNewBill={() => router.navigate('/bill')}
    />
  );
}
