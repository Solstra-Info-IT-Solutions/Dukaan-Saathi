// Architecture boundaries are enforced here (docs/CLEAN_ARCHITECTURE.md §1, §4).
// A violation fails `npm run lint` and CI.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const restrict = (patterns) => ['error', { patterns }];

const PLATFORM = ['react', 'react-native', 'react-native-*', 'expo', 'expo-*', '@expo/*', '@supabase/*', '@tanstack/*', 'zustand', 'zustand/*', 'i18next', 'react-i18next'];

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*', 'node_modules/*'] },
  {
    // Domain: pure business rules, no platform, no data layer, no UI.
    files: ['src/features/*/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrict([
        { group: PLATFORM, message: 'Domain code must not depend on React, Expo, Supabase or state libraries.' },
        { group: ['@/core/*', '@/shared/*', '@/bootstrap/*', '@/app/*'], message: 'Domain code must not depend on core/shared/composition.' },
        { group: ['**/data/**', '**/presentation/**'], message: 'Domain must not import data or presentation layers.' },
      ]),
    },
  },
  {
    // Data: repository implementations and data sources. No UI.
    files: ['src/features/*/data/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrict([
        { group: ['react-native', 'react-native-paper', 'expo-router', '@tanstack/*', 'zustand'], message: 'Data layer must not depend on UI or presentation state.' },
        { group: ['**/presentation/**', '@/shared/components/*'], message: 'Data layer must not import presentation.' },
      ]),
    },
  },
  {
    // Presentation: screens, components, ViewModels. Data only through repository interfaces (via use cases).
    files: ['src/features/*/presentation/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrict([
        { group: ['@supabase/*', 'expo-sqlite', 'expo-secure-store'], message: 'Presentation must not access storage or the backend directly.' },
        { group: ['**/data/**', '@/core/network/*', '@/core/storage/*'], message: 'Presentation must use use cases / repository interfaces, not data sources.' },
      ]),
    },
  },
  {
    // Screens render state and forward intents; async data lives in ViewModels.
    files: ['src/features/*/presentation/screens/**/*.tsx', 'src/features/*/presentation/components/**/*.tsx'],
    rules: {
      'no-restricted-imports': restrict([
        { group: ['@supabase/*', 'expo-sqlite', 'expo-secure-store', '@tanstack/*'], message: 'Screens must not fetch data; use the ViewModel.' },
        { group: ['**/data/**', '**/domain/usecases/**', '@/bootstrap/*'], message: 'Screens talk only to their ViewModel.' },
      ]),
    },
  },
  {
    // Core and shared must never depend on features.
    files: ['src/core/**/*.{ts,tsx}', 'src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrict([{ group: ['@/features/*', '@/bootstrap/*'], message: 'core/shared must not depend on features or composition.' }]),
    },
  },
]);
