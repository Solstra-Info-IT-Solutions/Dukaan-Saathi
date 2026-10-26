import { formatQuantity, quantityMilli } from '@ds/domain-core';
import { REPORT_GROUPS } from '@ds/contracts';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Card, Chip, HelperText, SegmentedButtons, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import type { RangePreset, SalesReport } from '../../domain/entities/Reports';
import {
  type CsvLabels,
  money,
  type ReportsViewModelDeps,
  useReportsViewModel,
} from '../viewmodels/useReportsViewModel';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="bodySmall">{label}</Text>
      <Text variant="titleMedium">{value}</Text>
    </View>
  );
}

export function ReportsScreen({
  deps,
  shopId,
  canViewReports,
  canExport,
}: {
  deps: ReportsViewModelDeps;
  shopId: string;
  canViewReports: boolean;
  canExport: boolean;
}) {
  const { t } = useTranslation();
  const { state, actions } = useReportsViewModel(deps, shopId, canViewReports);
  const d = state.dashboard;

  if (state.dashboardLoading) return <LoadingState />;
  if (state.dashboardErrorKey || !d) {
    return <ErrorState messageKey={state.dashboardErrorKey ?? 'errors.UNKNOWN'} onRetry={actions.refresh} />;
  }

  const rowLabel = (row: SalesReport['rows'][number]) =>
    state.groupBy === 'payment'
      ? t(`payments.${row.label}`, { defaultValue: row.label })
      : row.label === 'quick'
        ? t('reports.quickItems')
        : row.label === 'none'
          ? t('reports.noCategory')
          : row.label;
  const csvLabels: CsvLabels = {
    header: [
      t(`reports.groups.${state.groupBy}`),
      t('reports.sales'),
      t('reports.bills'),
      t('reports.quantity'),
      t('reports.returns'),
      t('reports.net'),
      t('reports.profit'),
    ],
    label: rowLabel,
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={false} onRefresh={actions.refresh} />}
    >
      <Text variant="titleLarge" accessibilityRole="header">
        {t('reports.today')}
      </Text>
      <Card>
        <Card.Content style={styles.grid}>
          <Stat label={t('reports.sales')} value={money(d.salesPaise)} />
          <Stat label={t('reports.bills')} value={String(d.bills)} />
          {d.scope === 'shop' ? (
            <>
              <Stat label={t('reports.returns')} value={money(d.returnsPaise)} />
              <Stat label={t('reports.net')} value={money(d.netSalesPaise)} />
              <Stat label={t('reports.expenses')} value={money(d.expensesPaise)} />
              <Stat label={t('reports.udhaarGiven')} value={money(d.udhaarGivenPaise)} />
              <Stat label={t('reports.udhaarCollected')} value={money(d.udhaarCollectedPaise)} />
              <Stat label={t('reports.voided')} value={String(d.voidedBills)} />
              {(['cash', 'upi', 'card', 'other'] as const)
                .filter((m) => (d.payments[m] ?? 0) > 0)
                .map((m) => (
                  <Stat key={m} label={t(`payments.${m}`)} value={money(d.payments[m] ?? 0)} />
                ))}
              {d.profit ? (
                <Stat
                  label={t('reports.profitEstimate', {
                    coverage: d.profit.lines
                      ? Math.round((100 * d.profit.linesWithCost) / d.profit.lines)
                      : 0,
                  })}
                  value={money(d.profit.profitPaise)}
                />
              ) : null}
            </>
          ) : null}
        </Card.Content>
      </Card>
      {d.scope === 'own' ? <Text variant="bodySmall">{t('reports.ownOnly')}</Text> : null}

      {canViewReports ? (
        <>
          <Text variant="titleLarge" accessibilityRole="header" style={styles.gap}>
            {t('reports.title')}
          </Text>
          <SegmentedButtons
            value={state.preset}
            onValueChange={(v) => actions.setPreset(v as RangePreset)}
            buttons={[
              { value: 'today', label: t('sales.today') },
              { value: 'week', label: t('sales.week') },
              { value: 'month', label: t('reports.month') },
            ]}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {REPORT_GROUPS.map((g) => (
              <Chip
                key={g}
                selected={state.groupBy === g}
                onPress={() => actions.setGroupBy(g)}
                showSelectedCheck
              >
                {t(`reports.groups.${g}`)}
              </Chip>
            ))}
          </ScrollView>
          {state.needsUpgrade ? (
            <Banner visible icon="star-outline">
              {t('reports.upgrade')}
            </Banner>
          ) : state.reportErrorKey ? (
            <HelperText type="error">{t(state.reportErrorKey)}</HelperText>
          ) : state.report ? (
            <Card>
              <Card.Content style={styles.rows}>
                {state.report.rows.length === 0 ? (
                  <Text variant="bodyMedium">{t('reports.empty')}</Text>
                ) : null}
                {state.report.rows.map((row) => (
                  <View key={`${row.key}`} style={styles.row}>
                    <View style={styles.flex}>
                      <Text variant="bodyMedium">{rowLabel(row)}</Text>
                      <Text variant="bodySmall">
                        {[
                          row.bills !== undefined ? t('reports.billCount', { count: row.bills }) : null,
                          row.quantityMilli
                            ? `${t('reports.quantity')} ${formatQuantity(quantityMilli(row.quantityMilli))}`
                            : null,
                          row.returnsPaise ? `${t('reports.returns')} ${money(row.returnsPaise)}` : null,
                          row.profitPaise !== undefined
                            ? `${t('reports.profit')} ${money(row.profitPaise)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <Text variant="titleMedium">{money(row.netPaise ?? row.salesPaise)}</Text>
                  </View>
                ))}
                <View style={styles.row}>
                  <Text variant="titleMedium" style={styles.flex}>
                    {t('reports.total')}
                  </Text>
                  <Text variant="titleMedium">
                    {money(state.report.totals.salesPaise - state.report.totals.returnsPaise)}
                  </Text>
                </View>
                <Text variant="bodySmall">
                  {t('reports.totalsLine', {
                    sales: money(state.report.totals.salesPaise),
                    returns: money(state.report.totals.returnsPaise),
                    expenses: money(state.report.totals.expensesPaise),
                  })}
                </Text>
              </Card.Content>
            </Card>
          ) : (
            <LoadingState />
          )}
          {canExport && state.report ? (
            <Button
              mode="outlined"
              icon="file-delimited-outline"
              onPress={() => actions.exportCsv(csvLabels)}
              loading={state.exporting}
              disabled={state.exporting}
              contentStyle={styles.button}
            >
              {t('reports.export')}
            </Button>
          ) : null}
          {state.messageKey ? (
            <Text variant="bodySmall">{t(state.messageKey, state.messageParams)}</Text>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm },
  stat: { width: '50%' },
  gap: { marginTop: spacing.md },
  chips: { gap: spacing.xs, paddingVertical: spacing.xs },
  rows: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  button: { minHeight: 48 },
});
