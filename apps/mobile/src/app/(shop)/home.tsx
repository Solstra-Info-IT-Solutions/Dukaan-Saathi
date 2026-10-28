import { View } from 'react-native';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useSessionStore } from '@/core/session/sessionStore';
import { ShopHomeScreen } from '@/features/shops';
import { AnnouncementBanner } from '@/features/support';

export default function HomeRoute() {
  const { features } = useDependencies();
  const shop = useSessionStore((s) => s.activeShop);
  if (!features || !shop) return null; // the root guard redirects
  return (
    <View style={{ flex: 1 }}>
      <AnnouncementBanner deps={features.support} />
      <ShopHomeScreen deps={{ getEntitlements: features.shops.getEntitlements }} shop={shop} />
    </View>
  );
}
