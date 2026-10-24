import { ScrollView, StyleSheet } from 'react-native';
import { Button, HelperText, List, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import type { ModuleEntry } from '@/shared/navigation/modules';
import { spacing } from '@/shared/theme/theme';
import { type MoreViewModelDeps, useMoreViewModel } from '../viewmodels/useMoreViewModel';

export function MoreScreen({
  deps,
  onOpen,
  onSwitchShop,
}: {
  deps: MoreViewModelDeps;
  onOpen: (href: ModuleEntry['href']) => void;
  onSwitchShop: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useMoreViewModel(deps);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="headlineSmall" accessibilityRole="header">
        {state.shopName}
      </Text>
      {state.role ? <Text variant="bodyMedium">{t(`roles.${state.role}`)}</Text> : null}

      {state.modules.map((m) => (
        <List.Item
          key={m.key}
          title={t(m.labelKey)}
          left={(props) => <List.Icon {...props} icon={m.icon} />}
          onPress={() => onOpen(m.href)}
          accessibilityRole="button"
        />
      ))}
      <List.Item
        title={t('more.switchShop')}
        left={(props) => <List.Icon {...props} icon="store-outline" />}
        onPress={onSwitchShop}
        accessibilityRole="button"
      />

      <HelperText type="error" visible={state.errorKey !== null}>
        {state.errorKey ? t(state.errorKey) : ''}
      </HelperText>
      <Button
        mode="outlined"
        onPress={actions.signOut}
        loading={state.signingOut}
        disabled={state.signingOut}
        contentStyle={styles.button}
      >
        {t('more.signOut')}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.xs },
  button: { minHeight: 48, marginTop: spacing.lg },
});
