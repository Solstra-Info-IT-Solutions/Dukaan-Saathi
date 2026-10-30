import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { ForgotPasswordScreen } from '@/features/authentication';

/** Forgot password: code by email, then a new password (the user is signed in afterwards). */
export default function ForgotRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  if (!features) return <Redirect href="/login" />;
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ForgotPasswordScreen
        deps={{
          requestPasswordReset: features.auth.requestPasswordReset,
          resetPassword: features.auth.resetPassword,
        }}
        initialEmail={email ?? ''}
        onBack={() => router.back()}
      />
    </SafeAreaView>
  );
}
