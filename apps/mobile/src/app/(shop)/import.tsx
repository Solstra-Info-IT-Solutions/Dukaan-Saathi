import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { catalogueKeys } from '@/features/catalogue';
import { ImportScreen } from '@/features/imports';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function ImportRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const queryClient = useQueryClient();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  if (!features || !shopId) return null;
  return (
    <RequirePermission permission="product.manage">
      <ImportScreen
        deps={{
          ...features.imports,
          onCommitted: () => void queryClient.invalidateQueries({ queryKey: catalogueKeys.all(shopId) }),
        }}
        shopId={shopId}
        onDone={() => router.back()}
      />
    </RequirePermission>
  );
}
