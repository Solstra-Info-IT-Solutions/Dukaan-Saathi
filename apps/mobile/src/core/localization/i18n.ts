import { getLocales } from 'expo-localization';
import { createInstance, type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';

export const SUPPORTED_LANGUAGES = ['en', 'hi'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const resources = { en: { translation: en }, hi: { translation: hi } } as const;

/** Device language if supported, else Hindi (primary audience, PRODUCT_REQUIREMENTS.md §2). */
export function detectLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  return code === 'en' ? 'en' : 'hi';
}

/** The app's single i18next instance (not the library's global default). */
const instance: I18n = createInstance();
let initialised = false;

export function initI18n(language: Language = detectLanguage()): I18n {
  if (!initialised) {
    void instance.use(initReactI18next).init({
      resources,
      lng: language,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      initAsync: false,
    });
    initialised = true;
  }
  return instance;
}

export function setLanguage(language: Language): Promise<unknown> {
  return instance.changeLanguage(language);
}
