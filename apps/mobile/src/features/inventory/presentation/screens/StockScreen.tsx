import { FlatList, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, HelperText, List, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import type { StockItem } from '../../domain/entities/Inventory';
import { qty, type StockViewModelDeps, useStockViewModel } from '../viewmodels/useStockViewModel';

export function StockScreen({
  deps,
  shopId,
  canAdjust,
  onOpenItem,
  onCount,
}: {
  deps: StockViewModelDeps;
  shopId: string;
  canAdjust: boolean;
  onOpenItem: (item: StockItem) => void;
  onCount: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useStockViewModel(deps, shopId);
  const unit = (code: string) => t(`billing.units.${code}`, { defaultValue: code });

  if (state.loadErrorKey) return <ErrorState messageKey={state.loadErrorKey} onRetry={actions.reload} />;

  return (
    <FlatList
      data={state.items}
      keyExtractor={(i) => i.productId}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.row}>
            <TextInput
              mode="outlined"
              dense
              style={styles.flex}
              label={t('billing.searchItems')}
              accessibilityLabel={t('billing.searchItems')}
              value={state.query}
              onChangeText={actions.setQuery}
            />
            <Chip selected={state.lowOnly} onPress={actions.toggleLowOnly} showSelectedCheck>
              {t('inventory.lowOnly')}
            </Chip>
          </View>
          {canAdjust ? (
            <View style={styles.row}>
              <Button mode="outlined" icon="clipboard-check-outline" onPress={onCount}>
                {t('inventory.count.open')}
              </Button>
              <Button mode="text" onPress={() => void actions.checkDrift()}>
                {t('inventory.drift.check')}
              </Button>
            </View>
          ) : null}
          {state.drift ? (
            <Card>
              <Card.Content>
                {state.drift.length === 0 ? (
                  <Text variant="bodyMedium">{t('inventory.drift.ok')}</Text>
                ) : (
                  state.drift.map((d) => (
                    <Text key={d.productId} variant="bodyMedium">
                      {t('inventory.drift.item', {
                        name: d.name,
                        onHand: qty(d.stockOnHandMilli),
                        movements: qty(d.fromMovementsMilli),
                      })}
                    </Text>
                  ))
                )}
              </Card.Content>
            </Card>
          ) : null}
          <HelperText type="error" visible={state.errorKey !== null}>
            {state.errorKey ? t(state.errorKey) : ''}
          </HelperText>
        </View>
      }
      ListEmptyComponent={
        state.loading ? (
          <LoadingState />
        ) : (
          <Text variant="bodyMedium" style={styles.empty}>
            {state.lowOnly ? t('inventory.noneLow') : t('inventory.empty')}
          </Text>
        )
      }
      renderItem={({ item }) => (
        <List.Item
          title={item.name}
          description={
            item.lowStockThresholdMilli !== null
              ? t('inventory.alertAt', { qty: qty(item.lowStockThresholdMilli), unit: unit(item.unitCode) })
              : undefined
          }
          onPress={() => onOpenItem(item)}
          right={() => (
            <View style={styles.qty}>
              <Text variant="titleMedium" style={item.isLow ? styles.low : undefined}>
                {qty(item.stockOnHandMilli)} {unit(item.unitCode)}
              </Text>
              {item.isLow ? (
                <Text variant="labelSmall" style={styles.low}>
                  {t('inventory.low')}
                </Text>
              ) : null}
            </View>
          )}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.xl },
  header: { padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  empty: { textAlign: 'center', padding: spacing.lg, opacity: 0.7 },
  qty: { alignItems: 'flex-end', justifyContent: 'center' },
  low: { color: '#B3261E' },
});
