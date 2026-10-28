import { ScrollView, StyleSheet } from 'react-native';
import { Button, Dialog, HelperText, List, Portal, Text } from 'react-native-paper';
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
          description={m.locked ? t('plan.locked') : undefined}
          left={(props) => <List.Icon {...props} icon={m.icon} />}
          right={m.locked ? (props) => <List.Icon {...props} icon="lock-outline" /> : undefined}
          // A locked module opens the plan screen instead (upsell); the server refuses the module anyway.
          onPress={() => onOpen(m.locked ? '/plan' : m.href)}
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
      <Portal>
        <Dialog visible={state.unsent !== null} onDismiss={actions.cancelSignOut}>
          <Dialog.Title>{t('more.unsent.title')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{t('more.unsent.body', { count: state.unsent ?? 0 })}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={actions.cancelSignOut}>{t('common.cancel')}</Button>
            <Button onPress={actions.confirmSignOut}>{t('more.unsent.signOutAnyway')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.xs },
  button: { minHeight: 48, marginTop: spacing.lg },
});
