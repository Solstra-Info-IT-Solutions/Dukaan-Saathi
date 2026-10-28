import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useHasPermission, useSessionStore } from '@/core/session/sessionStore';
import { ProductsScreen } from '@/features/catalogue';
import { OnboardingStatusCard } from '@/features/onboarding';

export default function ItemsRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  const canManage = useHasPermission('product.manage');
  const canRequestSetup = useHasPermission('onboarding.request');
  if (!features || !shopId) return null;
  return (
    <ProductsScreen
      deps={{
        searchProducts: features.catalogue.searchProducts,
        loadReference: features.catalogue.loadReference,
      }}
      shopId={shopId}
      canManage={canManage}
      onOpenProduct={(id) => router.push({ pathname: '/product', params: { id } })}
      onAddProduct={() => router.push('/product')}
      onOpenCategories={() => router.push('/categories')}
      onOpenImport={() => router.push('/import')}
      banner={
        canRequestSetup ? (
          <OnboardingStatusCard
            deps={features.onboarding}
            shopId={shopId}
            canReview={canManage}
            onRequest={() => router.push('/setup-help')}
            onReview={(jobId) => router.push({ pathname: '/import', params: { jobId } })}
          />
        ) : null
      }
    />
  );
}
