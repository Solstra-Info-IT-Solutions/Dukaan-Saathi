import { formatPaise, paise } from '@ds/domain-core';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, List, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import {
  type SalesHistoryViewModelDeps,
  type SalesRange,
  useSalesHistoryViewModel,
} from '../viewmodels/useSalesHistoryViewModel';

export function SalesHistoryScreen({
  deps,
  shopId,
  onOpenSale,
}: {
  deps: SalesHistoryViewModelDeps;
  shopId: string;
  onOpenSale: (saleId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { state, actions } = useSalesHistoryViewModel(deps, shopId);
  const time = new Intl.DateTimeFormat(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });

  const header = (
    <View style={styles.header}>
      <SegmentedButtons
        value={state.range}
        onValueChange={(v) => actions.setRange(v as SalesRange)}
        buttons={[
          { value: 'today', label: t('sales.today') },
          { value: 'week', label: t('sales.week') },
          { value: 'all', label: t('sales.all') },
        ]}
      />
      <View style={styles.row}>
        <TextInput
          mode="outlined"
          dense
          style={styles.flex}
          label={t('sales.search')}
          accessibilityLabel={t('sales.search')}
          value={state.query}
          onChangeText={actions.setQuery}
        />
        <Chip selected={state.voidedOnly} onPress={actions.toggleVoided} showSelectedCheck>
          {t('sales.voidedOnly')}
        </Chip>
      </View>
    </View>
  );

  if (state.errorKey) return <ErrorState messageKey={state.errorKey} onRetry={actions.refresh} />;

  return (
    <FlatList
      data={state.items}
      keyExtractor={(s) => s.saleId}
      ListHeaderComponent={header}
      contentContainerStyle={styles.container}
      onEndReached={actions.loadMore}
      onEndReachedThreshold={0.5}
      refreshing={state.refreshing}
      onRefresh={actions.refresh}
      ListEmptyComponent={
        state.loading ? (
          <LoadingState />
        ) : (
          <Text variant="bodyMedium" style={styles.empty}>
            {t('sales.empty')}
          </Text>
        )
      }
      ListFooterComponent={state.loadingMore ? <ActivityIndicator style={styles.footer} /> : undefined}
      renderItem={({ item }) => (
        <List.Item
          title={item.invoiceNumber}
          description={
            `${time.format(new Date(item.createdAt))} · ${t('sales.items', { count: item.itemCount })} · ` +
            item.methods.map((m) => t(`payments.${m}`)).join(' + ') +
            (item.createdByName ? ` · ${item.createdByName}` : '')
          }
          onPress={() => onOpenSale(item.saleId)}
          right={() => (
            <View style={styles.amount}>
              <Text variant="titleMedium" style={item.status === 'voided' ? styles.struck : undefined}>
                {formatPaise(paise(item.totalPaise))}
              </Text>
              {item.status === 'voided' ? <Text variant="labelSmall">{t('sales.voided')}</Text> : null}
            </View>
          )}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  header: { padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  empty: { textAlign: 'center', padding: spacing.lg, opacity: 0.7 },
  footer: { padding: spacing.md },
  amount: { alignItems: 'flex-end', justifyContent: 'center' },
  struck: { textDecorationLine: 'line-through' },
});
