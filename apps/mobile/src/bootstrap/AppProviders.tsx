import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initAppearance, resolveDark, useAppearanceStore } from '@/core/appearance/appearance';
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
  const mode = useAppearanceStore((s) => s.mode);
  const theme = resolveDark(mode, scheme) ? darkTheme : lightTheme;
  // Navigation (stack headers, screen backgrounds) follows the same brand theme as Paper.
  const base = theme.dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.onSurface,
      border: theme.colors.outlineVariant,
    },
  };

  useEffect(() => {
    void initAppearance(container.storage);
  }, [container]);

  useEffect(() => startConnectivityMonitoring(), []);
  useEffect(
    () => (container.supabase ? bindAuthRefreshToAppState(container.supabase) : undefined),
    [container],
  );

  return (
    <SafeAreaProvider>
      <I18nextProvider i18n={i18n}>
        <PaperProvider theme={theme}>
          <ThemeProvider value={navTheme}>
            <QueryClientProvider client={queryClient}>
              <DependenciesProvider value={container}>{children}</DependenciesProvider>
            </QueryClientProvider>
          </ThemeProvider>
        </PaperProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
