import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { useConnectivityStore } from '@/core/connectivity/connectivity';
import { useSessionStore } from '@/core/session/sessionStore';
import { SyncChip } from '@/features/sync';
import { BrandLogo } from '@/shared/components/BrandLogo';

/** Runs the phone's sync for the active shop: start, back online, back in the foreground (OFFLINE_SYNC_DESIGN.md §5). */
function useShopSync() {
  const { features } = useDependencies();
  const shop = useSessionStore((s) => s.activeShop);
  const userId = useSessionStore((s) => s.userId);
  const online = useConnectivityStore((s) => s.isOnline);
  const service = features?.sync.service;
  useEffect(() => {
    if (!service || !shop || !userId) return;
    service.start({ shopId: shop.shopId, deviceId: shop.deviceId, userId });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') service.nudge();
    });
    return () => {
      sub.remove();
      service.stop();
    };
  }, [service, shop, userId]);
  useEffect(() => {
    if (online) service?.nudge();
  }, [online, service]);
}

/** Tabs for the active shop. Settings/staff open from More; the receipt opens after a bill. */
export default function ShopLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const shopName = useSessionStore((s) => s.activeShop?.shopName ?? '');
  const theme = useTheme();
  useShopSync();
  return (
    <Tabs
      screenOptions={{
        headerTitle: shopName,
        // Brand: white header with the forest shop name and the logo mark; forest for the active tab.
        headerStyle: { backgroundColor: theme.colors.surface },
        headerShadowVisible: false,
        headerTitleStyle: { color: theme.colors.onSurface, fontFamily: 'Inter', fontWeight: '700' },
        headerTintColor: theme.colors.primary,
        headerLeft: () => <BrandLogo variant="icon" width={28} style={{ marginLeft: 16 }} />,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant },
        tabBarLabelStyle: { fontFamily: 'Inter', fontWeight: '600' },
        // Tablets / iPads: content stays a readable width, centred, instead of stretching edge to edge.
        sceneStyle: {
          backgroundColor: theme.colors.background,
          width: '100%',
          maxWidth: 960,
          alignSelf: 'center',
        },
        headerRight: () => (
          <View style={{ marginRight: 8 }}>
            <SyncChip onPress={() => router.push('/sync')} />
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="bill"
        options={{
          title: t('tabs.bill'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cash-register" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: t('tabs.sales'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="receipt-text-outline" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="store" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="items"
        options={{
          title: t('tabs.items'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="package-variant" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('tabs.more'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="menu" color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen name="settings" options={{ href: null, title: t('settings.title') }} />
      <Tabs.Screen name="staff" options={{ href: null, title: t('staff.title') }} />
      <Tabs.Screen name="product" options={{ href: null, title: t('catalogue.form.editTitle') }} />
      <Tabs.Screen name="categories" options={{ href: null, title: t('catalogue.categories') }} />
      <Tabs.Screen name="import" options={{ href: null, title: t('imports.title') }} />
      <Tabs.Screen name="receipt" options={{ href: null, title: t('billing.receipt.title') }} />
      <Tabs.Screen name="reports" options={{ href: null, title: t('more.reports') }} />
      <Tabs.Screen name="expenses" options={{ href: null, title: t('more.expenses') }} />
      <Tabs.Screen name="expense-new" options={{ href: null, title: t('expenses.add') }} />
      <Tabs.Screen name="day-close" options={{ href: null, title: t('more.dayClose') }} />
      <Tabs.Screen name="stock" options={{ href: null, title: t('more.stock') }} />
      <Tabs.Screen name="stock-item" options={{ href: null, title: t('more.stock') }} />
      <Tabs.Screen name="stock-count" options={{ href: null, title: t('inventory.count.open') }} />
      <Tabs.Screen name="sync" options={{ href: null, title: t('sync.title') }} />
      <Tabs.Screen name="udhaar" options={{ href: null, title: t('more.udhaar') }} />
      <Tabs.Screen name="customer" options={{ href: null, title: t('more.udhaar') }} />
      <Tabs.Screen name="customer-new" options={{ href: null, title: t('customers.add') }} />
      <Tabs.Screen name="suppliers" options={{ href: null, title: t('more.suppliers') }} />
      <Tabs.Screen name="supplier" options={{ href: null, title: t('more.suppliers') }} />
      <Tabs.Screen name="supplier-new" options={{ href: null, title: t('purchases.addSupplier') }} />
      <Tabs.Screen name="purchase-new" options={{ href: null, title: t('purchases.newPurchase') }} />
      <Tabs.Screen name="profile" options={{ href: null, title: t('profile.title') }} />
      <Tabs.Screen name="change-password" options={{ href: null, title: t('profile.changePassword') }} />
      <Tabs.Screen name="legal" options={{ href: null, title: t('legal.menu') }} />
      <Tabs.Screen name="plan" options={{ href: null, title: t('more.plan') }} />
      <Tabs.Screen name="setup-help" options={{ href: null, title: t('onboarding.request.title') }} />
      <Tabs.Screen name="help" options={{ href: null, title: t('more.help') }} />
      <Tabs.Screen name="help-new" options={{ href: null, title: t('support.new') }} />
      <Tabs.Screen name="help-ticket" options={{ href: null, title: t('more.help') }} />
    </Tabs>
  );
}
