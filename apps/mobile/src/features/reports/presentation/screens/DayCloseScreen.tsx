import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, HelperText, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import { type DayCloseViewModelDeps, money, useDayCloseViewModel } from '../viewmodels/useDayCloseViewModel';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text variant={strong ? 'titleMedium' : 'bodyMedium'} style={styles.flex}>
        {label}
      </Text>
      <Text variant={strong ? 'titleMedium' : 'bodyMedium'}>{value}</Text>
    </View>
  );
}

export function DayCloseScreen({
  deps,
  shopId,
  deviceId,
}: {
  deps: DayCloseViewModelDeps;
  shopId: string;
  deviceId: string;
}) {
  const { t } = useTranslation();
  const { state, actions } = useDayCloseViewModel(deps, shopId, deviceId);

  if (state.loading) return <LoadingState />;
  if (state.loadErrorKey || !state.day) {
    return <ErrorState messageKey={state.loadErrorKey ?? 'errors.UNKNOWN'} onRetry={actions.reload} />;
  }
  const { day } = state;
  const b = day.breakdown;
  const diffLabel = (d: number) =>
    d === 0
      ? t('dayClose.matches')
      : d > 0
        ? t('dayClose.extra', { amount: money(d) })
        : t('dayClose.short', { amount: money(-d) });

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="headlineSmall" accessibilityRole="header">
        {t('dayClose.title', { date: day.businessDate })}
      </Text>
      <Text variant="bodySmall">{t('dayClose.thisPhone')}</Text>
      <Card>
        <Card.Content style={styles.gap}>
          {day.closed ? <Row label={t('dayClose.opening')} value={money(b.openingCashPaise)} /> : null}
          <Row label={t('dayClose.cashSales')} value={money(b.cashSalesPaise)} />
          <Row label={t('dayClose.cashRefunds')} value={`-${money(b.cashRefundsPaise)}`} />
          <Row label={t('dayClose.cashExpenses')} value={`-${money(b.cashExpensesPaise)}`} />
          {day.closed ? (
            <>
              <Row label={t('dayClose.expected')} value={money(b.expectedCashPaise)} strong />
              <Row label={t('dayClose.counted')} value={money(day.countedCashPaise ?? 0)} strong />
              <Text variant="titleMedium">{diffLabel(day.differencePaise ?? 0)}</Text>
            </>
          ) : null}
        </Card.Content>
      </Card>

      {day.closed ? (
        <Text variant="bodyMedium">{t('dayClose.closed')}</Text>
      ) : (
        <>
          <TextInput
            mode="outlined"
            keyboardType="decimal-pad"
            label={t('dayClose.opening')}
            accessibilityLabel={t('dayClose.opening')}
            value={state.openingText}
            onChangeText={actions.setOpeningText}
          />
          {state.expected !== null ? (
            <Text variant="titleMedium">{t('dayClose.expectedIs', { amount: money(state.expected) })}</Text>
          ) : null}
          <TextInput
            mode="outlined"
            keyboardType="decimal-pad"
            label={t('dayClose.counted')}
            accessibilityLabel={t('dayClose.counted')}
            value={state.countedText}
            onChangeText={actions.setCountedText}
          />
          {state.difference !== null ? (
            <Text variant="titleMedium">{diffLabel(state.difference)}</Text>
          ) : null}
          <TextInput
            mode="outlined"
            label={t('dayClose.note')}
            accessibilityLabel={t('dayClose.note')}
            value={state.note}
            onChangeText={actions.setNote}
            maxLength={200}
          />
          <HelperText type="error" visible={state.errorKey !== null}>
            {state.errorKey ? t(state.errorKey) : ''}
          </HelperText>
          <Button
            mode="contained"
            onPress={actions.close}
            loading={state.closing}
            disabled={state.closing}
            contentStyle={styles.button}
          >
            {t('dayClose.close')}
          </Button>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  gap: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  button: { minHeight: 56 },
});
