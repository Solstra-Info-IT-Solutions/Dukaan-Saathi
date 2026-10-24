import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { sessionActions } from '@/core/session/sessionStore';
import { SelectShopScreen } from '@/features/shops';

export default function SelectShopRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  if (!features) return <Redirect href="/login" />;
  const { shops, account } = features;
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <SelectShopScreen
        deps={{
          loadContext: shops.loadContext,
          activateShop: shops.activateShop,
          acceptInvitation: shops.acceptInvitation,
        }}
        onActivated={sessionActions.setActiveShop}
        onCreateShop={() => router.push('/create-shop')}
        onSignOut={() => void account.signOut.execute()}
      />
    </SafeAreaView>
  );
}
