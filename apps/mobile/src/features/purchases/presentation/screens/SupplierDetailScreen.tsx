import { formatPaise, paise } from '@ds/domain-core';
import { ScrollView, StyleSheet } from 'react-native';
import { Card, HelperText, List, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { Button } from '@/shared/components/Button';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import type { PaymentMethod } from '../../domain/entities/Purchases';
import {
  type SupplierDetailViewModelDeps,
  useSupplierDetailViewModel,
} from '../viewmodels/useSuppliersViewModel';

const money = (p: number) => formatPaise(paise(p));

export function SupplierDetailScreen({
  deps,
  shopId,
  deviceId,
  supplierId,
  canPay,
  canReceive,
  onNewPurchase,
}: {
  deps: SupplierDetailViewModelDeps;
  shopId: string;
  deviceId: string;
  supplierId: string;
  canPay: boolean;
  canReceive: boolean;
  onNewPurchase: (supplierId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { state, actions } = useSupplierDetailViewModel(deps, shopId, deviceId, supplierId);
  if (state.loading) return <LoadingState />;
  if (state.loadErrorKey || !state.supplier) {
    return <ErrorState messageKey={state.loadErrorKey ?? 'errors.DS_NOT_FOUND'} onRetry={actions.reload} />;
  }
  const s = state.supplier;
  const date = new Intl.DateTimeFormat(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
    dateStyle: 'medium',
    timeZone: 'Asia/Kolkata',
  });

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="headlineSmall" accessibilityRole="header">
        {s.name}
      </Text>
      <Text variant="titleLarge">
        {s.balancePaise >= 0
          ? t('purchases.owe', { amount: money(s.balancePaise) })
          : t('purchases.advance', { amount: money(-s.balancePaise) })}
      </Text>
      {canReceive ? (
        <Button mode="contained-tonal" icon="truck-delivery-outline" onPress={() => onNewPurchase(s.id)}>
          {t('purchases.newPurchase')}
        </Button>
      ) : null}

      {canPay ? (
        <Card>
          <Card.Content style={styles.gap}>
            <Text variant="titleMedium">{t('purchases.pay.title')}</Text>
            <TextInput
              mode="outlined"
              keyboardType="decimal-pad"
              label={t('expenses.amount')}
              accessibilityLabel={t('purchases.pay.amount')}
              value={state.amountText}
              onChangeText={actions.setAmountText}
            />
            <SegmentedButtons
              value={state.method}
              onValueChange={(v) => actions.setMethod(v as PaymentMethod)}
              buttons={(['cash', 'upi', 'card', 'other'] as const).map((m) => ({
                value: m,
                label: t(`payments.${m}`),
              }))}
            />
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
            <Button mode="contained" onPress={actions.pay} loading={state.paying} disabled={state.paying}>
              {t('purchases.pay.confirm')}
            </Button>
          </Card.Content>
        </Card>
      ) : null}

      <Text variant="titleMedium">{t('purchases.ledger')}</Text>
      {state.ledger.map((e) => (
        <List.Item
          key={e.id}
          title={`${t(`purchases.kinds.${e.kind}`)} ${e.amountPaise > 0 ? '+' : '−'}${money(Math.abs(e.amountPaise))}`}
          description={[
            date.format(new Date(e.createdAt)),
            e.method ? t(`payments.${e.method}`) : null,
            e.note,
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
});
