import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@/bootstrap/AppProviders';

// Route groups (auth), (onboarding), (shop) are added in Phase 02 (UI_FLOWS.md §2).
export default function RootLayout() {
  return (
    <AppProviders>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </AppProviders>
  );
}
