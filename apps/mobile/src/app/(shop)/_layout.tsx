import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/core/session/sessionStore';

/** Tabs for the active shop. Settings/staff open from More; the receipt opens after a bill. */
export default function ShopLayout() {
  const { t } = useTranslation();
  const shopName = useSessionStore((s) => s.activeShop?.shopName ?? '');
  return (
    <Tabs screenOptions={{ headerTitle: shopName }}>
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
      <Tabs.Screen name="suppliers" options={{ href: null, title: t('more.suppliers') }} />
      <Tabs.Screen name="supplier" options={{ href: null, title: t('more.suppliers') }} />
      <Tabs.Screen name="supplier-new" options={{ href: null, title: t('purchases.addSupplier') }} />
      <Tabs.Screen name="purchase-new" options={{ href: null, title: t('purchases.newPurchase') }} />
    </Tabs>
  );
}
