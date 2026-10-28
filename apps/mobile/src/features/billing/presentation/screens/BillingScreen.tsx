import { formatPaise, formatQuantity, paise, quantityMilli } from '@ds/domain-core';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, HelperText, IconButton, List, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import { type KeypadKey, lineAmount } from '../../domain/billMath';
import type { BillingContext, BillLine, VoiceBillLine } from '../../domain/entities/Bill';
import { LineEditorSheet } from '../components/LineEditorSheet';
import { PaymentSheet } from '../components/PaymentSheet';
import { ScannerSheet } from '../components/ScannerSheet';
import { type BillingViewModelDeps, useBillingViewModel } from '../viewmodels/useBillingViewModel';

const money = (value: number) => formatPaise(paise(value));
const KEYS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '.'];

export function BillingScreen({
  deps,
  context,
  onCompleted,
  onCreateProduct,
  voice,
}: {
  deps: BillingViewModelDeps;
  context: BillingContext;
  onCompleted: (saleId: string) => void;
  onCreateProduct: (barcode: string) => void;
  /** Phase 10: the mic button, given the action that adds confirmed voice lines to this bill. */
  voice?: (addLines: (lines: VoiceBillLine[]) => void) => ReactNode;
}) {
  const { t } = useTranslation();
  const vm = useBillingViewModel(deps, context, onCompleted);
  const { state, actions } = vm;

  if (state.loading) return <LoadingState />;
  if (state.settingsErrorKey) {
    return <ErrorState messageKey={state.settingsErrorKey} onRetry={actions.reloadSettings} />;
  }

  const total = state.totals?.totalPaise ?? 0;
  const unit = (code: string) => t(`billing.units.${code}`, { defaultValue: code });
  const describe = (line: BillLine, i: number) =>
    line.kind === 'quick'
      ? { title: line.label || t('billing.item', { number: i + 1 }), detail: undefined }
      : {
          title: line.name,
          detail:
            `${formatQuantity(quantityMilli(line.quantityMilli))} ${unit(line.unitCode)} × ${money(line.unitPricePaise)}` +
            (line.unitPricePaise !== line.listPricePaise ? ` · ${t('billing.overridden')}` : '') +
            (line.lineDiscountPaise > 0 ? ` · -${money(line.lineDiscountPaise)}` : ''),
        };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.row}>
          <TextInput
            mode="outlined"
            dense
            style={styles.flex}
            left={<TextInput.Icon icon="magnify" />}
            label={t('billing.searchItems')}
            accessibilityLabel={t('billing.searchItems')}
            value={state.searchText}
            onChangeText={actions.setSearchText}
          />
          <IconButton
            icon="barcode-scan"
            mode="contained"
            size={28}
            accessibilityLabel={t('billing.scan.open')}
            onPress={actions.openScanner}
          />
          {voice ? voice(actions.addVoiceLines) : null}
        </View>
        {state.results.length > 0 ? (
          <Card>
            {state.results.slice(0, 6).map((p) => (
              <List.Item
                key={p.id}
                title={p.name}
                description={p.nameHi ?? undefined}
                onPress={() => actions.pickResult(p)}
                right={() => (
                  <Text variant="titleSmall" style={styles.center}>
                    {money(p.pricePaise)}/{unit(p.unitCode)}
                  </Text>
                )}
              />
            ))}
          </Card>
        ) : state.searchText.trim() && !state.searching ? (
          <Text variant="bodySmall">{t('billing.noResults')}</Text>
        ) : null}

        {state.lines.length === 0 ? (
          <Text variant="bodyMedium" style={styles.muted}>
            {t('billing.emptyHint')}
          </Text>
        ) : (
          <Card>
            {state.lines.map((line, i) => {
              const { title, detail } = describe(line, i);
              return (
                <List.Item
                  key={line.key}
                  title={title}
                  description={detail}
                  onPress={line.kind === 'product' ? () => actions.openLine(line.key) : undefined}
                  right={() => (
                    <View style={styles.row}>
                      <Text variant="titleMedium">{money(lineAmount(line))}</Text>
                      <IconButton
                        icon="close"
                        accessibilityLabel={t('billing.removeLine', { number: i + 1 })}
                        onPress={() => actions.removeLine(line.key)}
                      />
                    </View>
                  )}
                />
              );
            })}
          </Card>
        )}

        {state.totals ? (
          <View style={styles.totals}>
            {state.totals.discountPaise > 0 ? (
              <Text variant="bodyMedium">
                {t('billing.discount')}: -{money(state.totals.discountPaise)}
              </Text>
            ) : null}
            {state.totals.taxPaise > 0 ? (
              <Text variant="bodyMedium">
                {t('billing.taxIncluded')}: {money(state.totals.taxPaise)}
              </Text>
            ) : null}
            {state.totals.roundOffPaise !== 0 ? (
              <Text variant="bodyMedium">
                {t('billing.roundOff')}: {money(state.totals.roundOffPaise)}
              </Text>
            ) : null}
            <Text variant="headlineSmall" accessibilityRole="header">
              {t('billing.total')}: {money(total)}
            </Text>
          </View>
        ) : null}

        {state.canDiscount ? (
          <TextInput
            mode="outlined"
            dense
            keyboardType="decimal-pad"
            label={t('billing.discountLabel', { percent: state.discountLimitPercent })}
            accessibilityLabel={t('billing.discount')}
            value={state.discountText}
            onChangeText={actions.changeDiscount}
          />
        ) : null}

        <Text variant="displaySmall" style={styles.entry} accessibilityLabel={t('billing.amount')}>
          ₹{state.entry || '0'}
        </Text>
        <TextInput
          mode="outlined"
          dense
          label={t('billing.itemName')}
          accessibilityLabel={t('billing.itemName')}
          value={state.label}
          onChangeText={actions.setLabel}
          maxLength={60}
        />

        <View style={styles.keypad}>
          {KEYS.map((key) => (
            <Button
              key={key}
              mode="outlined"
              style={styles.key}
              contentStyle={styles.keyContent}
              labelStyle={styles.keyLabel}
              onPress={() => actions.press(key)}
            >
              {key}
            </Button>
          ))}
          <Button
            mode="outlined"
            icon="backspace-outline"
            style={styles.key}
            contentStyle={styles.keyContent}
            accessibilityLabel={t('billing.backspace')}
            onPress={() => actions.press('back')}
          >
            {''}
          </Button>
          <Button
            mode="contained-tonal"
            style={[styles.key, styles.wide]}
            contentStyle={styles.keyContent}
            onPress={actions.addLine}
            disabled={state.entryPaise === null}
          >
            {t('billing.addLine')}
          </Button>
        </View>
        {state.phase === 'editing' && state.editor === null ? (
          <HelperText type="error" visible={state.errorKey !== null}>
            {state.errorKey ? t(state.errorKey, state.errorParams) : ''}
          </HelperText>
        ) : null}
      </ScrollView>

      <Button
        mode="contained"
        onPress={actions.openPayment}
        style={styles.pay}
        contentStyle={styles.payContent}
      >
        {state.entryPaise !== null || state.lines.length === 0
          ? t('billing.pay')
          : t('billing.payAmount', { amount: money(total) })}
      </Button>

      <PaymentSheet {...vm} />
      <LineEditorSheet {...vm} />
      <ScannerSheet {...vm} onCreateProduct={onCreateProduct} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  muted: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  center: { alignSelf: 'center' },
  totals: { alignItems: 'flex-end', gap: spacing.xs },
  entry: { textAlign: 'right' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.xs },
  key: { width: '32%' },
  wide: { width: '65%' },
  keyContent: { minHeight: 56 },
  keyLabel: { fontSize: 22 },
  pay: { margin: spacing.md },
  payContent: { minHeight: 56 },
});
