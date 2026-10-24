import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { PaperProvider } from 'react-native-paper';
import { initI18n, setLanguage, type Language } from '@/core/localization/i18n';
import { lightTheme } from '@/shared/theme/theme';

const i18n = initI18n('en');

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

function Providers({ children, client }: { children: ReactNode; client: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <PaperProvider theme={lightTheme}>{children}</PaperProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}

/** Renders a screen with the providers every screen expects (query client, theme, i18n). */
export async function renderWithProviders(
  ui: ReactElement,
  options: { language?: Language; client?: QueryClient } = {},
) {
  await setLanguage(options.language ?? 'en');
  const client = options.client ?? createTestQueryClient();
  return render(<Providers client={client}>{ui}</Providers>);
}

/** renderHook with a fresh query client (ViewModels that use TanStack Query). */
export function renderHookWithQuery<R>(hook: () => R, client: QueryClient = createTestQueryClient()) {
  return renderHook(hook, {
    wrapper: ({ children }: { children: ReactNode }) => <Providers client={client}>{children}</Providers>,
  });
}
