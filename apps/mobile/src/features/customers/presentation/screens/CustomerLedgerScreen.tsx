import { formatPaise, paise } from '@ds/domain-core';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Card, HelperText, List, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import type { RepaymentMethod } from '../../domain/entities/Customers';
import {
  type CustomerLedgerViewModelDeps,
  type LedgerShop,
  useCustomerLedgerViewModel,
} from '../viewmodels/useCustomersViewModel';

const money = (p: number) => formatPaise(paise(p));

export function CustomerLedgerScreen({
  deps,
  shop,
  customerId,
  canCollect,
  canAdjust,
  onOpenSale,
}: {
  deps: CustomerLedgerViewModelDeps;
  shop: LedgerShop;
  customerId: string;
  canCollect: boolean;
  canAdjust: boolean;
  onOpenSale: (saleId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'hi' ? 'hi' : 'en';
  const { state, actions } = useCustomerLedgerViewModel(deps, shop, customerId, language);
  if (state.loading) return <LoadingState />;
  if (state.loadErrorKey || !state.customer) {
    return <ErrorState messageKey={state.loadErrorKey ?? 'errors.DS_NOT_FOUND'} onRetry={actions.reload} />;
  }
  const c = state.customer;
  const date = new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    dateStyle: 'medium',
    timeZone: 'Asia/Kolkata',
  });
  const balanceText = (p: number) =>
    p > 0
      ? t('customers.owes', { amount: money(p) })
      : p < 0
        ? t('customers.advance', { amount: money(-p) })
        : t('customers.settled');

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="headlineSmall" accessibilityRole="header">
        {c.name}
      </Text>
      {c.phone ? <Text variant="bodyMedium">{c.phone}</Text> : null}
      <Text variant="titleLarge">{balanceText(c.balancePaise)}</Text>
      {c.creditLimitPaise !== null ? (
        <Text variant="bodyMedium">{t('customers.limit', { amount: money(c.creditLimitPaise) })}</Text>
      ) : null}
      {state.reminder ? (
        <Button mode="contained-tonal" icon="whatsapp" onPress={actions.remind}>
          {t('customers.remind')}
        </Button>
      ) : null}

      {canCollect ? (
        <Card>
          <Card.Content style={styles.gap}>
            <Text variant="titleMedium">{t('customers.repay.title')}</Text>
            <TextInput
              mode="outlined"
              keyboardType="decimal-pad"
              label={t('customers.repay.amount')}
              accessibilityLabel={t('customers.repay.amount')}
              value={state.amountText}
              onChangeText={actions.setAmountText}
            />
            <SegmentedButtons
              value={state.method}
              onValueChange={(v) => actions.setMethod(v as RepaymentMethod)}
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
            <HelperText type="error" visible={state.payErrorKey !== null}>
              {state.payErrorKey ? t(state.payErrorKey) : ''}
            </HelperText>
            <Button mode="contained" onPress={actions.pay} loading={state.paying} disabled={state.paying}>
              {t('customers.repay.confirm')}
            </Button>
          </Card.Content>
        </Card>
      ) : null}

      {canAdjust ? (
        <Card>
          <Card.Content style={styles.gap}>
            <Text variant="titleMedium">{t('customers.adjust.title')}</Text>
            <SegmentedButtons
              value={state.adjustDirection}
              onValueChange={(v) => actions.setAdjustDirection(v as 'add' | 'reduce')}
              buttons={[
                { value: 'reduce', label: t('customers.adjust.reduce') },
                { value: 'add', label: t('customers.adjust.add') },
              ]}
            />
            <TextInput
              mode="outlined"
              keyboardType="decimal-pad"
              label={t('customers.adjust.amount')}
              accessibilityLabel={t('customers.adjust.amount')}
              value={state.adjustText}
              onChangeText={actions.setAdjustText}
            />
            <TextInput
              mode="outlined"
              label={t('customers.adjust.reason')}
              accessibilityLabel={t('customers.adjust.reason')}
              value={state.reason}
              onChangeText={actions.setReason}
              maxLength={200}
            />
            <HelperText type="error" visible={state.adjustErrorKey !== null}>
              {state.adjustErrorKey ? t(state.adjustErrorKey) : ''}
            </HelperText>
            <Button
              mode="outlined"
              onPress={actions.adjust}
              loading={state.adjusting}
              disabled={state.adjusting}
            >
              {t('customers.adjust.confirm')}
            </Button>
          </Card.Content>
        </Card>
      ) : null}

      <Text variant="titleMedium">{t('customers.ledger')}</Text>
      {state.entries.length === 0 ? <Text variant="bodyMedium">{t('customers.noEntries')}</Text> : null}
      {state.entries.map((e) => {
        const saleId = e.saleId;
        return (
          <List.Item
            key={e.id}
            title={`${t(`customers.kinds.${e.kind}`)} ${e.amountPaise > 0 ? '+' : '−'}${money(Math.abs(e.amountPaise))}`}
            description={[
              date.format(new Date(e.createdAt)),
              e.invoiceNumber,
              e.method ? t(`payments.${e.method}`) : null,
              e.note,
              t('customers.after', { balance: balanceText(e.balanceAfterPaise) }),
            ]
              .filter(Boolean)
              .join(' · ')}
            onPress={saleId ? () => onOpenSale(saleId) : undefined}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  gap: { gap: spacing.sm },
});
