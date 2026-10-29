import type { ClientConfig } from '@ds/contracts';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, Button, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/shared/theme/theme';
import { appGateState, PLAY_STORE_URL, PLAY_STORE_WEB_URL } from '../domain/appGate';

export interface AppGateDeps {
  getClientConfig: () => Promise<ClientConfig>;
  openUrl: (url: string) => Promise<void>;
  appVersion: string;
}

export const clientConfigKey = ['clientConfig'] as const;

/**
 * Wraps the whole app: blocks it behind "please update" when this version is no longer supported, and shows the
 * maintenance message and a new-version hint above it. Fetched on start and every `refreshSeconds`; when the config
 * cannot be fetched (offline) the app is not blocked.
 */
export function AppGate({ deps, children }: { deps: AppGateDeps | null; children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const [hideUpdateHint, setHideUpdateHint] = useState(false);
  const config = useQuery({
    queryKey: clientConfigKey,
    queryFn: () => deps!.getClientConfig(),
    enabled: deps !== null,
    refetchInterval: (q) => (q.state.data?.refreshSeconds ?? 900) * 1000,
  });
  if (!deps || !config.data) return <>{children}</>;
  const gate = appGateState(config.data, deps.appVersion);
  const lang = i18n.language === 'hi' ? 'hi' : 'en';
  const openStore = () => void deps.openUrl(PLAY_STORE_URL).catch(() => deps.openUrl(PLAY_STORE_WEB_URL));

  if (gate.updateRequired) {
    return (
      <View style={styles.center} accessibilityRole="alert">
        <Text variant="headlineSmall" accessibilityRole="header">
          {t('appGate.updateTitle')}
        </Text>
        <Text variant="bodyLarge" style={styles.text}>
          {t('appGate.updateBody')}
        </Text>
        <Button mode="contained" icon="google-play" onPress={openStore} contentStyle={styles.button}>
          {t('appGate.update')}
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {gate.maintenance ? (
        <Banner visible icon="wrench-outline" accessibilityRole="alert">
          {gate.maintenance.message[lang] || gate.maintenance.message.en || t('appGate.maintenance')}
        </Banner>
      ) : null}
      {gate.updateAvailable && !hideUpdateHint ? (
        <Banner
          visible
          icon="update"
          actions={[
            { label: t('appGate.update'), onPress: openStore },
            { label: t('common.dismiss'), onPress: () => setHideUpdateHint(true) },
          ]}
        >
          {t('appGate.updateAvailable')}
        </Banner>
      ) : null}
      <View style={styles.flex}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  text: { textAlign: 'center' },
  button: { minHeight: 56 },
});
