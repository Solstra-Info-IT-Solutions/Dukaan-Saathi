import { useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { ProfileScreen } from '@/features/account';

/** More → My profile (every member). */
export default function ProfileRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  if (!features) return null;
  return (
    <ProfileScreen
      deps={features.account}
      onChangePassword={(email) => router.push({ pathname: '/change-password', params: { email } })}
      onSignOut={() => void features.account.signOut.execute()}
    />
  );
}
