import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useHasPermission, useSessionStore } from '@/core/session/sessionStore';
import { ProductsScreen } from '@/features/catalogue';

export default function ItemsRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  const canManage = useHasPermission('product.manage');
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
    />
  );
}
