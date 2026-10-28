import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { catalogueKeys } from '@/features/catalogue';
import { ImportScreen } from '@/features/imports';
import { onboardingKeys } from '@/features/onboarding';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function ImportRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  if (!features || !shopId) return null;
  return (
    <RequirePermission permission="product.manage">
      <ImportScreen
        deps={{
          ...features.imports,
          onCommitted: () => {
            void queryClient.invalidateQueries({ queryKey: catalogueKeys.all(shopId) });
            void queryClient.invalidateQueries({ queryKey: onboardingKeys.all(shopId) });
          },
        }}
        key={jobId ?? 'file'}
        jobId={jobId}
        shopId={shopId}
        onDone={() => router.back()}
      />
    </RequirePermission>
  );
}
