import { STOCK_ADJUST_REASONS } from '@ds/contracts';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, HelperText, List, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import { type StockItemViewModelDeps, useStockItemViewModel } from '../viewmodels/useStockItemViewModel';
import { qty } from '../viewmodels/useStockViewModel';

export function StockItemScreen({
  deps,
  shopId,
  productId,
  canAdjust,
}: {
  deps: StockItemViewModelDeps;
  shopId: string;
  productId: string;
  canAdjust: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { state, actions } = useStockItemViewModel(deps, shopId, productId);
  if (state.loading) return <LoadingState />;
  if (state.loadErrorKey || !state.item) {
    return <ErrorState messageKey={state.loadErrorKey ?? 'errors.DS_NOT_FOUND'} onRetry={actions.reload} />;
  }
  const item = state.item;
  const unit = t(`billing.units.${item.unitCode}`, { defaultValue: item.unitCode });
  const time = new Intl.DateTimeFormat(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="headlineSmall" accessibilityRole="header">
        {item.name}
      </Text>
      <Text variant="titleLarge">{t('inventory.onHand', { qty: qty(item.stockOnHandMilli), unit })}</Text>

      {canAdjust ? (
        <Card>
          <Card.Content style={styles.gap}>
            <Text variant="titleMedium">{t('inventory.adjust.title')}</Text>
            <SegmentedButtons
              value={state.direction}
              onValueChange={(v) => actions.setDirection(v as 'add' | 'remove')}
              buttons={[
                { value: 'add', label: t('inventory.adjust.add') },
                { value: 'remove', label: t('inventory.adjust.remove') },
              ]}
            />
            <TextInput
              mode="outlined"
              keyboardType={item.allowsFraction ? 'decimal-pad' : 'number-pad'}
              label={t('inventory.adjust.quantity', { unit })}
              accessibilityLabel={t('inventory.adjust.quantity', { unit })}
              value={state.quantityText}
              onChangeText={actions.setQuantityText}
            />
            <View style={styles.chips}>
              {STOCK_ADJUST_REASONS.map((r) => (
                <Chip
                  key={r}
                  selected={state.reason === r}
                  onPress={() => actions.setReason(r)}
                  showSelectedCheck
                >
                  {t(`inventory.reasons.${r}`)}
                </Chip>
              ))}
            </View>
            <TextInput
              mode="outlined"
              label={t('expenses.note')}
              accessibilityLabel={t('expenses.note')}
              value={state.note}
              onChangeText={actions.setNote}
              maxLength={200}
            />
            <HelperText type="error" visible={state.errorKey !== null}>
              {state.errorKey ? t(state.errorKey) : ''}
            </HelperText>
            <Button
              mode="contained"
              onPress={actions.save}
              loading={state.saving}
              disabled={state.saving}
              contentStyle={styles.button}
            >
              {t('inventory.adjust.save')}
            </Button>
          </Card.Content>
        </Card>
      ) : null}

      <Text variant="titleMedium">{t('inventory.history')}</Text>
      {state.movements.length === 0 && !state.movementsLoading ? (
        <Text variant="bodyMedium">{t('inventory.noHistory')}</Text>
      ) : null}
      {state.movements.map((m) => (
        <List.Item
          key={m.id}
          title={`${m.quantityMilli > 0 ? '+' : '−'}${qty(Math.abs(m.quantityMilli))} ${unit}`}
          description={[
            t(`inventory.kinds.${m.kind}`),
            m.reason ? t(`inventory.reasons.${m.reason}`) : null,
            m.note,
            time.format(new Date(m.createdAt)),
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  gap: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  button: { minHeight: 48 },
});
