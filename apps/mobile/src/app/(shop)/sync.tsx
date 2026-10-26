import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { SyncStatusScreen } from '@/features/sync';

export default function SyncRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  const userId = useSessionStore((s) => s.userId);
  if (!features || !shopId || !userId) return null;
  return (
    <SyncStatusScreen
      deps={features.sync}
      shopId={shopId}
      userId={userId}
      onOpenSale={(saleId) => router.push({ pathname: '/receipt', params: { saleId } })}
    />
  );
}
