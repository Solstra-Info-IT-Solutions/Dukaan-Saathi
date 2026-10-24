import { formatPaise, paise } from '@ds/domain-core';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Divider, List, SegmentedButtons, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import type { Language } from '@/core/localization/i18n';
import { type DiagnosticsViewModelDeps, useDiagnosticsViewModel } from '../viewmodels/useDiagnosticsViewModel';

/** Renders ViewModel state and forwards intents. No data access here. */
export function DiagnosticsScreen({ deps }: { deps: DiagnosticsViewModelDeps }) {
  const { t, i18n } = useTranslation();
  const { state, actions } = useDiagnosticsViewModel(deps);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error' && !state.report) {
    return <ErrorState messageKey={state.error?.messageKey ?? 'errors.UNKNOWN'} onRetry={actions.refresh} />;
  }
  const report = state.report;
  if (!report) return <LoadingState />;

  const backendLabel = {
    not_configured: t('diagnostics.backendNotConfigured'),
    reachable: `${t('diagnostics.backendReachable')}${report.backendLatencyMs !== null ? ` · ${report.backendLatencyMs} ms` : ''}`,
    unreachable: t('diagnostics.backendUnreachable'),
  }[report.backendStatus];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="headlineSmall" accessibilityRole="header">
        {t('diagnostics.title')}
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        {t('diagnostics.subtitle')}
      </Text>

      <List.Item title={t('diagnostics.version')} description={report.appVersion} />
      <List.Item title={t('diagnostics.environment')} description={report.appEnv} />
      <List.Item title={t('diagnostics.network')} description={state.isOnline ? t('diagnostics.online') : t('diagnostics.offline')} />
      <List.Item title={t('diagnostics.backend')} description={backendLabel} testID="backend-status" />
      <List.Item
        title={t('diagnostics.config')}
        description={report.configSource === 'bundled' ? t('diagnostics.configBundled') : report.configRevision}
      />
      <List.Item title={t('diagnostics.moneySample')} description={formatPaise(paise(12345650))} />

      {report.envIssues.length > 0 ? (
        <View style={styles.issues} accessibilityRole="alert">
          <Text variant="titleSmall">{t('diagnostics.issues')}</Text>
          {report.envIssues.map((issue) => (
            <Text key={issue} variant="bodySmall">
              • {issue}
            </Text>
          ))}
        </View>
      ) : null}

      <Divider style={styles.divider} />
      <Text variant="titleSmall">{t('diagnostics.language')}</Text>
      <SegmentedButtons
        style={styles.segment}
        value={i18n.language}
        onValueChange={(value) => actions.changeLanguage(value as Language)}
        buttons={[
          { value: 'hi', label: t('language.hi') },
          { value: 'en', label: t('language.en') },
        ]}
      />

      <Button
        mode="contained"
        onPress={actions.refresh}
        loading={state.status === 'refreshing'}
        disabled={state.status === 'refreshing'}
        contentStyle={styles.button}
        style={styles.divider}
      >
        {t('diagnostics.refresh')}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.md },
  issues: { marginTop: spacing.md, gap: spacing.xs },
  divider: { marginVertical: spacing.md },
  segment: { marginTop: spacing.sm },
  button: { minHeight: 48 },
});
