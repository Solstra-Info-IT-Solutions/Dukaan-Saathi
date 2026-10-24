import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { readEnv } from '@/core/config/env';
import { startConnectivityMonitoring } from '@/core/connectivity/connectivity';
import { initI18n } from '@/core/localization/i18n';
import { bindAuthRefreshToAppState } from '@/core/network/supabaseClient';
import { darkTheme, lightTheme } from '@/shared/theme/theme';
import { type Container, createContainer } from './container';
import { DependenciesProvider } from './DependenciesProvider';
import { createQueryClient } from './queryClient';

const i18n = initI18n();

/** Root providers. Created once per app launch. */
export function AppProviders({
  children,
  container: injected,
}: {
  children: ReactNode;
  container?: Container;
}) {
  const [container] = useState(() => injected ?? createContainer(readEnv()));
  const [queryClient] = useState(createQueryClient);
  const scheme = useColorScheme();

  useEffect(() => startConnectivityMonitoring(), []);
  useEffect(
    () => (container.supabase ? bindAuthRefreshToAppState(container.supabase) : undefined),
    [container],
  );

  return (
    <SafeAreaProvider>
      <I18nextProvider i18n={i18n}>
        <PaperProvider theme={scheme === 'dark' ? darkTheme : lightTheme}>
          <QueryClientProvider client={queryClient}>
            <DependenciesProvider value={container}>{children}</DependenciesProvider>
          </QueryClientProvider>
        </PaperProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
