import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { AppProviders } from '@/bootstrap/AppProviders';
import { useDependencies } from '@/bootstrap/DependenciesProvider';
import { SessionController } from '@/bootstrap/SessionController';
import { AppGate, ConsentGate } from '@/features/config';
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
    <AppGate deps={features?.config ?? null}>
      <SessionController features={features}>
        <GuardedStack />
      </SessionController>
    </AppGate>
  );
}

/**
 * Route groups are switched by session state (UI_FLOWS.md §2). These guards only decide what the
 * client shows; every RPC checks membership and permission on the server.
 */
function GuardedStack() {
  const { t } = useTranslation();
  const { features } = useDependencies();
  const authStatus = useSessionStore((s) => s.authStatus);
  const hasShop = useSessionStore((s) => s.activeShop !== null);
  if (authStatus === 'loading') return <LoadingState />;
  const signedIn = authStatus === 'signedIn';

  const stack = (
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
  // Signed-in users accept the published privacy policy and terms once per version (Phase 14).
  return signedIn && features ? (
    <ConsentGate deps={features.config} onSignOut={() => void features.account.signOut.execute()}>
      {stack}
    </ConsentGate>
  ) : (
    stack
  );
}
