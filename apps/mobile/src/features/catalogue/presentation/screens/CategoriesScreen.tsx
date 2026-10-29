import { ScrollView, StyleSheet, View } from 'react-native';
import { Dialog, HelperText, IconButton, List, Portal, Text, TextInput } from 'react-native-paper';
import { Button } from '@/shared/components/Button';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import { type CategoriesViewModelDeps, useCategoriesViewModel } from '../viewmodels/useCategoriesViewModel';

export function CategoriesScreen({ deps, shopId }: { deps: CategoriesViewModelDeps; shopId: string }) {
  const { t } = useTranslation();
  const { state, actions } = useCategoriesViewModel(deps, shopId);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error')
    return <ErrorState messageKey={state.loadErrorKey ?? 'errors.UNKNOWN'} onRetry={actions.retry} />;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="headlineSmall" accessibilityRole="header">
        {t('catalogue.categories')}
      </Text>
      <View style={styles.row}>
        <TextInput
          mode="outlined"
          style={styles.flex}
          label={t('catalogue.newCategory')}
          accessibilityLabel={t('catalogue.newCategory')}
          value={state.newName}
          onChangeText={actions.setNewName}
          onSubmitEditing={actions.add}
        />
        <Button
          mode="contained"
          onPress={actions.add}
          disabled={state.busy || !state.newName.trim()}
          style={styles.addButton}
        >
          {t('catalogue.addCategory')}
        </Button>
      </View>
      <HelperText type="error" visible={state.errorKey !== null}>
        {state.errorKey ? t(state.errorKey) : ''}
      </HelperText>

      {state.categories.length === 0 ? <Text variant="bodyMedium">{t('catalogue.noCategories')}</Text> : null}
      {state.categories.map((c) =>
        state.editing?.id === c.id ? (
          <View key={c.id} style={styles.row}>
            <TextInput
              mode="outlined"
              style={styles.flex}
              label={t('catalogue.renameCategory')}
              accessibilityLabel={t('catalogue.renameCategory')}
              value={state.editing.name}
              onChangeText={actions.setEditName}
              autoFocus
            />
            <IconButton
              icon="check"
              onPress={actions.saveEdit}
              disabled={state.busy}
              accessibilityLabel={t('settings.save')}
            />
            <IconButton icon="close" onPress={actions.cancelEdit} accessibilityLabel={t('common.cancel')} />
          </View>
        ) : (
          <List.Item
            key={c.id}
            title={c.name}
            description={c.nameHi ?? undefined}
            right={() => (
              <View style={styles.row}>
                <IconButton
                  icon="pencil-outline"
                  onPress={() => actions.startEdit(c.id, c.name)}
                  accessibilityLabel={`${t('catalogue.renameCategory')} ${c.name}`}
                />
                <IconButton
                  icon="archive-outline"
                  onPress={() => actions.askArchive(c.id)}
                  accessibilityLabel={`${t('catalogue.archiveCategory')} ${c.name}`}
                />
              </View>
            )}
          />
        ),
      )}

      <Portal>
        <Dialog visible={state.confirmArchiveId !== null} onDismiss={actions.cancelArchive}>
          <Dialog.Title>{t('staff.confirm.title')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{t('catalogue.archiveCategoryConfirm')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={actions.cancelArchive}>{t('common.cancel')}</Button>
            <Button onPress={actions.confirmArchive}>{t('common.confirm')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  addButton: { minHeight: 48, justifyContent: 'center' },
});
