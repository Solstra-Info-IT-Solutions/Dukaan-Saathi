import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useHasPermission, useSessionStore } from '@/core/session/sessionStore';
import { type HomeShortcut, ShopHomeScreen } from '@/features/shops';
import { AnnouncementBanner } from '@/features/support';

export default function HomeRoute() {
  const { features } = useDependencies();
  const shop = useSessionStore((s) => s.activeShop);
  const router = useRouter();
  const canSeePlan = useHasPermission('subscription.view');
  const canBill = useHasPermission('sale.create');
  const canUdhaar = useHasPermission('customer.view');
  if (!features || !shop) return null; // the root guard redirects
  // Shortcuts to existing screens, only the ones this member may open (each route checks again).
  const shortcuts: HomeShortcut[] = [
    ...(canBill
      ? [
          {
            key: 'bill',
            labelKey: 'home.newBill',
            icon: 'cash-register',
            onPress: () => router.push('/bill'),
          },
        ]
      : []),
    { key: 'items', labelKey: 'tabs.items', icon: 'package-variant', onPress: () => router.push('/items') },
    ...(canUdhaar
      ? [
          {
            key: 'udhaar',
            labelKey: 'more.udhaar',
            icon: 'notebook-outline',
            onPress: () => router.push('/udhaar'),
          },
        ]
      : []),
    { key: 'reports', labelKey: 'more.reports', icon: 'chart-bar', onPress: () => router.push('/reports') },
  ];
  return (
    <View style={{ flex: 1 }}>
      <AnnouncementBanner deps={features.support} />
      <ShopHomeScreen
        deps={{ getEntitlements: features.shops.getEntitlements }}
        shop={shop}
        onOpenPlan={canSeePlan ? () => router.push('/plan') : undefined}
        shortcuts={shortcuts}
      />
    </View>
  );
}
