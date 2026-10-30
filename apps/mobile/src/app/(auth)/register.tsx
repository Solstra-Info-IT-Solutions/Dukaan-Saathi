import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { RegisterScreen } from '@/features/authentication';

/** New shop owner. Signed in at once (the shop set-up follows), or confirm the email with a code. */
export default function RegisterRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  if (!features) return <Redirect href="/login" />;
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <RegisterScreen
        deps={{ registerAccount: features.auth.registerAccount }}
        onDone={(result) => {
          if (result.kind === 'confirm_email') {
            router.replace({ pathname: '/otp', params: { kind: 'email', value: result.email } });
          }
          // signed_in: the session controller moves on to creating the shop.
        }}
        onSignIn={() => router.back()}
      />
    </SafeAreaView>
  );
}
