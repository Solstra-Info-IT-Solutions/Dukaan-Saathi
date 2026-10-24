import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { CategoriesScreen } from '@/features/catalogue';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function CategoriesRoute() {
  const { features } = useDependencies();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  if (!features || !shopId) return null;
  const c = features.catalogue;
  return (
    <RequirePermission permission="product.manage">
      <CategoriesScreen
        deps={{
          loadReference: c.loadReference,
          saveCategory: c.saveCategory,
          archiveCategory: c.archiveCategory,
        }}
        shopId={shopId}
      />
    </RequirePermission>
  );
}
