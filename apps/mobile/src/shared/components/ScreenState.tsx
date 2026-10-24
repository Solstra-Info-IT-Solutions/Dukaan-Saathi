import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { spacing } from '../theme/theme';

/**
 * Standard loading / error / empty states (UI_FLOWS.md §5). Every screen uses these
 * instead of ad-hoc spinners so states look and read the same everywhere.
 */

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View
      style={styles.center}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t('common.loading')}
    >
      <ActivityIndicator size="large" />
      <Text variant="bodyMedium" style={styles.gap}>
        {label ?? t('common.loading')}
      </Text>
    </View>
  );
}

export function ErrorState({ messageKey, onRetry }: { messageKey: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <Text variant="titleMedium">{t(messageKey)}</Text>
      {onRetry ? (
        <Button mode="contained" onPress={onRetry} style={styles.gap} contentStyle={styles.button}>
          {t('common.retry')}
        </Button>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.center}>
      <Text variant="titleMedium">{title}</Text>
      {action ? (
        <Button mode="contained" onPress={action.onPress} style={styles.gap} contentStyle={styles.button}>
          {action.label}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  gap: { marginTop: spacing.md },
  button: { minHeight: 48 },
});
