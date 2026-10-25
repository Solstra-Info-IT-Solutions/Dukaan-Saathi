import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { SalesHistoryScreen } from '@/features/billing';

export default function SalesRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  if (!features || !shopId) return null;
  return (
    <SalesHistoryScreen
      deps={features.billing}
      shopId={shopId}
      onOpenSale={(saleId) => router.push({ pathname: '/receipt', params: { saleId } })}
    />
  );
}
