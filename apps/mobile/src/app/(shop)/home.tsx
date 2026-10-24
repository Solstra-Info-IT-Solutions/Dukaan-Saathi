import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { ShopHomeScreen } from '@/features/shops';

export default function HomeRoute() {
  const { features } = useDependencies();
  const shop = useSessionStore((s) => s.activeShop);
  if (!features || !shop) return null; // the root guard redirects
  return <ShopHomeScreen deps={{ getEntitlements: features.shops.getEntitlements }} shop={shop} />;
}
