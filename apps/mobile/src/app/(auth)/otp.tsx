import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { type OtpDestination, OtpScreen } from '@/features/authentication';

export default function OtpRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const { kind, value } = useLocalSearchParams<{ kind?: string; value?: string }>();
  const destination: OtpDestination | null =
    kind === 'phone' && value
      ? { kind: 'phone', phoneE164: value }
      : kind === 'email' && value
        ? { kind: 'email', email: value }
        : null;

  if (!features || !destination) return <Redirect href="/login" />;
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <OtpScreen
        deps={{ verifyOtp: features.auth.verifyOtp, requestOtp: features.auth.requestOtp }}
        destination={destination}
        onChangeDestination={() => router.back()}
      />
    </SafeAreaView>
  );
}
