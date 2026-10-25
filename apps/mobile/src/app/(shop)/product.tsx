import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { ProductFormScreen } from '@/features/catalogue';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function ProductRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const { id, barcode } = useLocalSearchParams<{ id?: string; barcode?: string }>();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  if (!features || !shopId) return null;
  const c = features.catalogue;
  return (
    <RequirePermission permission="product.manage">
      <ProductFormScreen
        key={id ?? `new-${barcode ?? ''}`}
        deps={{
          getProduct: c.getProduct,
          saveProduct: c.saveProduct,
          archiveProduct: c.archiveProduct,
          loadReference: c.loadReference,
          newId: c.newId,
        }}
        shopId={shopId}
        productId={id ?? null}
        initialBarcode={barcode}
        onDone={() => router.back()}
      />
    </RequirePermission>
  );
}
