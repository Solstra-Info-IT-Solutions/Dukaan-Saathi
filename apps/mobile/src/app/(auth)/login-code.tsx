import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { LoginScreen } from '@/features/authentication';
import { EmptyState } from '@/shared/components/ScreenState';

/** Sign in with a one-time code by phone or email (the earlier default; still offered). */
export default function LoginWithCodeRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={{ flex: 1 }}>
      {features ? (
        <LoginScreen
          deps={{ requestOtp: features.auth.requestOtp }}
          onCodeSent={(d) =>
            router.push({
              pathname: '/otp',
              params:
                d.kind === 'phone'
                  ? { kind: 'phone', value: d.phoneE164 }
                  : { kind: 'email', value: d.email },
            })
          }
          onOpenDiagnostics={() => router.push('/diagnostics')}
        />
      ) : (
        <EmptyState
          title={t('errors.BACKEND_NOT_CONFIGURED')}
          action={{ label: t('diagnostics.title'), onPress: () => router.push('/diagnostics') }}
        />
      )}
    </SafeAreaView>
  );
}
