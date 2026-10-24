import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { AppProviders } from '@/bootstrap/AppProviders';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { SessionController } from '@/bootstrap/SessionController';
import { useSessionStore } from '@/core/session/sessionStore';
import { LoadingState } from '@/shared/components/ScreenState';

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
      <StatusBar style="auto" />
    </AppProviders>
  );
}

function RootNavigator() {
  const { features } = useDependencies();
  return (
    <SessionController features={features}>
      <GuardedStack />
    </SessionController>
  );
}

/**
 * Route groups are switched by session state (UI_FLOWS.md §2). These guards only decide what the
 * client shows; every RPC checks membership and permission on the server.
 */
function GuardedStack() {
  const { t } = useTranslation();
  const authStatus = useSessionStore((s) => s.authStatus);
  const hasShop = useSessionStore((s) => s.activeShop !== null);
  if (authStatus === 'loading') return <LoadingState />;
  const signedIn = authStatus === 'signedIn';

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasShop}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && hasShop}>
        <Stack.Screen name="(shop)" />
      </Stack.Protected>
      <Stack.Screen name="diagnostics" options={{ headerShown: true, title: t('diagnostics.title') }} />
    </Stack>
  );
}
