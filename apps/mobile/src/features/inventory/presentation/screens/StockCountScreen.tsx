import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, HelperText, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import { type StockCountViewModelDeps, useStockCountViewModel } from '../viewmodels/useStockCountViewModel';
import { qty } from '../viewmodels/useStockViewModel';

export function StockCountScreen({
  deps,
  shopId,
  onDone,
}: {
  deps: StockCountViewModelDeps;
  shopId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useStockCountViewModel(deps, shopId);
  const unit = (code: string) => t(`billing.units.${code}`, { defaultValue: code });

  if (state.loading) return <LoadingState />;
  if (state.loadErrorKey) return <ErrorState messageKey={state.loadErrorKey} onRetry={actions.reload} />;

  if (state.result) {
    const changed = state.result.items.filter((i) => i.deltaMilli !== 0);
    const name = (id: string) => state.items.find((i) => i.productId === id)?.name ?? id;
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text variant="headlineSmall" accessibilityRole="header">
          {t('inventory.count.done', { count: state.result.items.length })}
        </Text>
        {changed.length === 0 ? <Text variant="bodyMedium">{t('inventory.count.noChanges')}</Text> : null}
        {changed.map((i) => (
          <Text key={i.productId} variant="bodyMedium">
            {t('inventory.count.change', {
              name: name(i.productId),
              from: qty(i.previousMilli),
              to: qty(i.countedMilli),
            })}
          </Text>
        ))}
        <Button mode="contained" onPress={onDone} contentStyle={styles.button}>
          {t('common.back')}
        </Button>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="bodyMedium">{t('inventory.count.hint')}</Text>
      {state.items.length === 0 ? <Text variant="bodyMedium">{t('inventory.empty')}</Text> : null}
      {state.items.map((item) => (
        <Card key={item.productId}>
          <Card.Content style={styles.row}>
            <View style={styles.flex}>
              <Text variant="bodyLarge">{item.name}</Text>
              <Text variant="bodySmall">
                {t('inventory.count.system', { qty: qty(item.stockOnHandMilli), unit: unit(item.unitCode) })}
              </Text>
            </View>
            <TextInput
              mode="outlined"
              dense
              style={styles.input}
              keyboardType={item.allowsFraction ? 'decimal-pad' : 'number-pad'}
              label={t('inventory.count.counted')}
              accessibilityLabel={t('inventory.count.countedFor', { name: item.name })}
              value={state.counted[item.productId] ?? ''}
              onChangeText={(v) => actions.setCounted(item.productId, v)}
            />
          </Card.Content>
        </Card>
      ))}
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
        onPress={actions.submit}
        loading={state.saving}
        disabled={state.saving}
        contentStyle={styles.button}
      >
        {t('inventory.count.submit')}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  input: { width: 110 },
  button: { minHeight: 48 },
});
