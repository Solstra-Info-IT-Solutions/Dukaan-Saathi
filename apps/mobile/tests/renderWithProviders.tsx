import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { PaperProvider } from 'react-native-paper';
import { initI18n, setLanguage, type Language } from '@/core/localization/i18n';
import { lightTheme } from '@/shared/theme/theme';

const i18n = initI18n('en');

/** Renders a screen with the providers every screen expects (theme, i18n). */
export async function renderWithProviders(ui: ReactElement, options: { language?: Language } = {}) {
  await setLanguage(options.language ?? 'en');
  return render(
    <I18nextProvider i18n={i18n}>
      <PaperProvider theme={lightTheme}>{ui}</PaperProvider>
    </I18nextProvider>,
  );
}
