import type { Permission } from '@ds/contracts';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useHasPermission } from '@/core/session/sessionStore';
import { spacing } from '../theme/theme';

/** Route-level guard so a deep link cannot open a screen the role may not use. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const allowed = useHasPermission(permission);
  const { t } = useTranslation();
  if (allowed) return <>{children}</>;
  return (
    <View style={styles.center} accessibilityRole="alert">
      <Text variant="titleMedium">{t('errors.DS_PERMISSION_DENIED')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
});
