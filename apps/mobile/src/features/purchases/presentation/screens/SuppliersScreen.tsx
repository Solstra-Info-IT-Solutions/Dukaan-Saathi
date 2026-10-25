import { formatPaise, paise } from '@ds/domain-core';
import { FlatList, StyleSheet, View } from 'react-native';
import { FAB, List, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import { type SuppliersViewModelDeps, useSuppliersViewModel } from '../viewmodels/useSuppliersViewModel';

const money = (p: number) => formatPaise(paise(p));

export function SuppliersScreen({
  deps,
  shopId,
  canManage,
  canReceive,
  onOpen,
  onAdd,
  onNewPurchase,
}: {
  deps: SuppliersViewModelDeps;
  shopId: string;
  canManage: boolean;
  canReceive: boolean;
  onOpen: (supplierId: string) => void;
  onAdd: () => void;
  onNewPurchase: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useSuppliersViewModel(deps, shopId);

  if (state.loadErrorKey) return <ErrorState messageKey={state.loadErrorKey} onRetry={actions.reload} />;

  return (
    <View style={styles.flex}>
      <FlatList
        data={state.items}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text variant="titleLarge" accessibilityRole="header">
              {t('purchases.totalOwed', { amount: money(state.totalOwedPaise) })}
            </Text>
          </View>
        }
        ListEmptyComponent={
          state.loading ? (
            <LoadingState />
          ) : (
            <Text variant="bodyMedium" style={styles.empty}>
              {t('purchases.noSuppliers')}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <List.Item
            title={item.name}
            description={item.phone ?? undefined}
            onPress={() => onOpen(item.id)}
            right={() => (
              <Text variant="titleMedium" style={styles.amount}>
                {item.balancePaise > 0
                  ? t('purchases.owe', { amount: money(item.balancePaise) })
                  : item.balancePaise < 0
                    ? t('purchases.advance', { amount: money(-item.balancePaise) })
                    : t('purchases.settled')}
              </Text>
            )}
          />
        )}
      />
      {canReceive ? (
        <FAB
          icon="truck-delivery-outline"
          label={t('purchases.newPurchase')}
          style={styles.fab}
          onPress={onNewPurchase}
        />
      ) : null}
      {canManage ? (
        <FAB
          icon="account-plus-outline"
          small
          style={styles.fabSmall}
          onPress={onAdd}
          accessibilityLabel={t('purchases.addSupplier')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingBottom: 140 },
  header: { padding: spacing.md },
  empty: { textAlign: 'center', padding: spacing.lg, opacity: 0.7 },
  amount: { alignSelf: 'center' },
  fab: { position: 'absolute', right: spacing.md, bottom: spacing.md },
  fabSmall: { position: 'absolute', right: spacing.md, bottom: 80 },
});
