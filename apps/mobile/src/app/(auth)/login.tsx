import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { PasswordLoginScreen } from '@/features/authentication';
import { EmptyState } from '@/shared/components/ScreenState';

/** Default sign-in: email and password. */
export default function LoginRoute() {
  const { features } = useDependencies();
  const router = useRouter();
  const { t } = useTranslation();
  if (!features) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <EmptyState
          title={t('errors.BACKEND_NOT_CONFIGURED')}
          action={{ label: t('diagnostics.title'), onPress: () => router.push('/diagnostics') }}
        />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
      <PasswordLoginScreen
        deps={{ signInWithPassword: features.auth.signInWithPassword }}
        onForgot={(email) => router.push({ pathname: '/forgot', params: email ? { email } : {} })}
        onRegister={() => router.push('/register')}
        onUseCode={() => router.push('/login-code')}
      />
    </SafeAreaView>
  );
}
