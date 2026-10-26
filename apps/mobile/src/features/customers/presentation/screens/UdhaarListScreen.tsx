import { formatPaise, paise } from '@ds/domain-core';
import { FlatList, StyleSheet, View } from 'react-native';
import { Chip, FAB, List, Searchbar, SegmentedButtons, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import type { CustomerSort } from '../../domain/entities/Customers';
import { type UdhaarListViewModelDeps, useUdhaarListViewModel } from '../viewmodels/useCustomersViewModel';

const money = (p: number) => formatPaise(paise(p));

export function UdhaarListScreen({
  deps,
  shopId,
  canAdd,
  onOpen,
  onAdd,
}: {
  deps: UdhaarListViewModelDeps;
  shopId: string;
  canAdd: boolean;
  onOpen: (customerId: string) => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useUdhaarListViewModel(deps, shopId);

  if (state.loadErrorKey) return <ErrorState messageKey={state.loadErrorKey} onRetry={actions.reload} />;

  return (
    <View style={styles.flex}>
      <FlatList
        data={state.items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <Text variant="titleLarge" accessibilityRole="header">
              {t('customers.totalOutstanding', { amount: money(state.totalOutstandingPaise) })}
            </Text>
            <Text variant="bodyMedium">
              {t('customers.withUdhaar', { count: state.customersWithUdhaar })}
            </Text>
            <Searchbar
              placeholder={t('customers.search')}
              accessibilityLabel={t('customers.search')}
              value={state.searchText}
              onChangeText={actions.setSearchText}
            />
            <SegmentedButtons
              value={state.sort}
              onValueChange={(v) => actions.setSort(v as CustomerSort)}
              buttons={(['highest', 'oldest', 'name'] as const).map((s) => ({
                value: s,
                label: t(`customers.sort.${s}`),
              }))}
            />
            <Chip
              selected={!state.udhaarOnly}
              showSelectedCheck
              onPress={() => actions.setUdhaarOnly(!state.udhaarOnly)}
              style={styles.chip}
            >
              {t('customers.showAll')}
            </Chip>
          </View>
        }
        ListEmptyComponent={
          state.loading ? (
            <LoadingState />
          ) : (
            <Text variant="bodyMedium" style={styles.empty}>
              {state.udhaarOnly ? t('customers.noUdhaar') : t('customers.noCustomers')}
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
                  ? t('customers.owes', { amount: money(item.balancePaise) })
                  : item.balancePaise < 0
                    ? t('customers.advance', { amount: money(-item.balancePaise) })
                    : t('customers.settled')}
              </Text>
            )}
          />
        )}
      />
      {canAdd ? (
        <FAB icon="account-plus-outline" label={t('customers.add')} style={styles.fab} onPress={onAdd} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingBottom: 96 },
  header: { padding: spacing.md, gap: spacing.sm },
  chip: { alignSelf: 'flex-start' },
  empty: { textAlign: 'center', padding: spacing.lg, opacity: 0.7 },
  amount: { alignSelf: 'center' },
  fab: { position: 'absolute', right: spacing.md, bottom: spacing.md },
});
