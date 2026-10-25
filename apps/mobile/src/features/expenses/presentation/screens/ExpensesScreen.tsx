import { formatPaise, paise } from '@ds/domain-core';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  Button,
  Dialog,
  FAB,
  HelperText,
  IconButton,
  List,
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import {
  type ExpenseRange,
  type ExpensesViewModelDeps,
  useExpensesViewModel,
} from '../viewmodels/useExpensesViewModel';

const money = (p: number) => formatPaise(paise(p));

export function ExpensesScreen({
  deps,
  shopId,
  canCreate,
  canVoid,
  onAdd,
}: {
  deps: ExpensesViewModelDeps;
  shopId: string;
  canCreate: boolean;
  canVoid: boolean;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useExpensesViewModel(deps, shopId);

  if (state.loadErrorKey) return <ErrorState messageKey={state.loadErrorKey} onRetry={actions.reload} />;

  return (
    <View style={styles.flex}>
      <FlatList
        data={state.items}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <SegmentedButtons
              value={state.range}
              onValueChange={(v) => actions.setRange(v as ExpenseRange)}
              buttons={[
                { value: 'today', label: t('sales.today') },
                { value: 'week', label: t('sales.week') },
                { value: 'month', label: t('reports.month') },
              ]}
            />
            <Text variant="titleLarge" accessibilityRole="header">
              {t('expenses.total', { amount: money(state.total) })}
            </Text>
            <HelperText type="error" visible={state.errorKey !== null && state.voidingId === null}>
              {state.errorKey ? t(state.errorKey) : ''}
            </HelperText>
          </View>
        }
        ListEmptyComponent={
          state.loading ? (
            <LoadingState />
          ) : (
            <Text variant="bodyMedium" style={styles.empty}>
              {t('expenses.empty')}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <List.Item
            title={`${t(`expenses.categories.${item.category}`)} · ${money(item.amountPaise)}`}
            titleStyle={item.voidedAt ? styles.struck : undefined}
            description={[
              item.businessDate,
              t(`payments.${item.method}`),
              item.note,
              item.voidedAt ? `${t('expenses.voided')}: ${item.voidReason ?? ''}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            right={() => (
              <View style={styles.row}>
                {item.attachmentPath ? (
                  <IconButton
                    icon="image-outline"
                    accessibilityLabel={t('expenses.viewPhoto')}
                    onPress={() => void actions.openPhoto(item.attachmentPath!)}
                  />
                ) : null}
                {canVoid && !item.voidedAt ? (
                  <IconButton
                    icon="cancel"
                    accessibilityLabel={t('expenses.void')}
                    onPress={() => actions.startVoid(item.id)}
                  />
                ) : null}
              </View>
            )}
          />
        )}
      />
      {canCreate ? <FAB icon="plus" label={t('expenses.add')} style={styles.fab} onPress={onAdd} /> : null}
      <Portal>
        <Dialog visible={state.voidingId !== null} onDismiss={actions.cancelVoid}>
          <Dialog.Title>{t('expenses.voidTitle')}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label={t('billing.void.reason')}
              accessibilityLabel={t('billing.void.reason')}
              value={state.reason}
              onChangeText={actions.setReason}
              maxLength={200}
            />
            <HelperText type="error" visible={state.errorKey !== null}>
              {state.errorKey ? t(state.errorKey) : ''}
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={actions.cancelVoid}>{t('common.cancel')}</Button>
            <Button onPress={actions.confirmVoid}>{t('expenses.void')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingBottom: 96 },
  header: { padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  empty: { textAlign: 'center', padding: spacing.lg, opacity: 0.7 },
  struck: { textDecorationLine: 'line-through' },
  fab: { position: 'absolute', right: spacing.md, bottom: spacing.md },
});
