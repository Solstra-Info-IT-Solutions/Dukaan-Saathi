import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { ChangePasswordScreen } from '@/features/account';
import { authErrorKey } from '@/features/authentication';

export default function ChangePasswordRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  if (!features || !email) return null;
  return (
    <ChangePasswordScreen
      deps={{ changePassword: features.auth.changePassword, errorKey: authErrorKey }}
      email={email}
      onDone={() => router.back()}
    />
  );
}
