import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/core/session/sessionStore';

/** Tabs for the active shop. Billing tabs arrive in Phase 04; settings/staff open from More. */
export default function ShopLayout() {
  const { t } = useTranslation();
  const shopName = useSessionStore((s) => s.activeShop?.shopName ?? '');
  return (
    <Tabs screenOptions={{ headerTitle: shopName }}>
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
    </Tabs>
  );
}
