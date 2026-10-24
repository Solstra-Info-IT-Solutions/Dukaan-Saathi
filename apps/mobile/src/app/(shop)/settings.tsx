import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { ShopSettingsScreen } from '@/features/shops';
import { RequirePermission } from '@/shared/components/RequirePermission';

export default function SettingsRoute() {
  const { features } = useDependencies();
  const shopId = useSessionStore((s) => s.activeShop?.shopId);
  if (!features || !shopId) return null;
  return (
    <RequirePermission permission="settings.manage">
      <ShopSettingsScreen
        deps={{ getSettings: features.shops.getSettings, updateSettings: features.shops.updateSettings }}
        shopId={shopId}
      />
    </RequirePermission>
  );
}
