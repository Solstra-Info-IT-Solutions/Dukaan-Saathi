import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { sessionActions } from '@/core/session/sessionStore';
import { CreateShopScreen } from '@/features/shops';

export default function CreateShopRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  if (!features) return <Redirect href="/login" />;
  const { shops } = features;
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <CreateShopScreen
        deps={{
          createShop: shops.createShop,
          loadContext: shops.loadContext,
          activateShop: shops.activateShop,
          newOperationId: shops.newOperationId,
        }}
        onActivated={sessionActions.setActiveShop}
        onCancel={() => router.back()}
      />
    </SafeAreaView>
  );
}
