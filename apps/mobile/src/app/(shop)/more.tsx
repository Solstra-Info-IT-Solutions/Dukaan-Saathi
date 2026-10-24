import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { sessionActions } from '@/core/session/sessionStore';
import { MoreScreen } from '@/features/account';

export default function MoreRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  if (!features) return null;
  return (
    <MoreScreen
      deps={features.account}
      onOpen={(href) => router.push(href)}
      onSwitchShop={() => sessionActions.setActiveShop(null)}
    />
  );
}
