import { formatPaise, paise } from '@ds/domain-core';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  HelperText,
  IconButton,
  List,
  Modal,
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import type { KeypadKey } from '../../domain/billMath';
import type { BillingContext } from '../../domain/entities/Bill';
import { type BillingViewModelDeps, useBillingViewModel } from '../viewmodels/useBillingViewModel';

const money = (value: number) => formatPaise(paise(value));
const KEYS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '.'];

export function BillingScreen({
  deps,
  context,
  onCompleted,
}: {
  deps: BillingViewModelDeps;
  context: BillingContext;
  onCompleted: (saleId: string) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { state, actions } = useBillingViewModel(deps, context, onCompleted);

  if (state.loading) return <LoadingState />;
  if (state.settingsErrorKey)
    return <ErrorState messageKey={state.settingsErrorKey} onRetry={actions.reloadSettings} />;

  const error = (
    <HelperText type="error" visible={state.errorKey !== null}>
      {state.errorKey ? t(state.errorKey, state.errorParams) : ''}
    </HelperText>
  );
  const total = state.totals?.totalPaise ?? 0;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {state.lines.length === 0 ? (
          <Text variant="bodyMedium" style={styles.muted}>
            {t('billing.emptyHint')}
          </Text>
        ) : (
          <Card>
            {state.lines.map((line, i) => (
              <List.Item
                key={line.key}
                title={line.label || t('billing.item', { number: i + 1 })}
                right={() => (
                  <View style={styles.row}>
                    <Text variant="titleMedium">{money(line.amountPaise)}</Text>
                    <IconButton
                      icon="close"
                      accessibilityLabel={t('billing.removeLine', { number: i + 1 })}
                      onPress={() => actions.removeLine(line.key)}
                    />
                  </View>
                )}
              />
            ))}
          </Card>
        )}

        {state.totals ? (
          <View style={styles.totals}>
            {state.totals.discountPaise > 0 ? (
              <Text variant="bodyMedium">
                {t('billing.discount')}: -{money(state.totals.discountPaise)}
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
        {state.phase === 'editing' ? error : null}
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

      <Portal>
        <Modal
          visible={state.phase !== 'editing'}
          onDismiss={state.phase === 'submitting' ? undefined : actions.closePayment}
          contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
            <Text variant="headlineSmall" accessibilityRole="header">
              {t('billing.total')}: {money(total)}
            </Text>
            <SegmentedButtons
              value={state.method ?? ''}
              onValueChange={(m) => actions.selectMethod(m as (typeof state.methods)[number])}
              buttons={state.methods.map((m) => ({ value: m, label: t(`payments.${m}`) }))}
            />
            {state.method === 'cash' ? (
              <>
                <TextInput
                  mode="outlined"
                  keyboardType="decimal-pad"
                  label={t('billing.cashTendered')}
                  accessibilityLabel={t('billing.cashTendered')}
                  value={state.tenderedText}
                  onChangeText={actions.setTenderedText}
                />
                {state.change !== null ? (
                  <Text variant="titleMedium">{t('billing.change', { amount: money(state.change) })}</Text>
                ) : null}
              </>
            ) : null}
            {state.method === 'upi' ? (
              state.upiUri ? (
                <View style={styles.qr}>
                  <QRCode value={state.upiUri} size={200} />
                  <Text variant="bodySmall" style={styles.center}>
                    {t('billing.upiHint')}
                  </Text>
                </View>
              ) : (
                <Text variant="bodySmall">{t('billing.upiNoVpa')}</Text>
              )
            ) : null}
            {error}
            <Button
              mode="contained"
              onPress={actions.submit}
              loading={state.phase === 'submitting'}
              disabled={state.phase === 'submitting' || !state.method}
              contentStyle={styles.payContent}
            >
              {state.method === 'upi'
                ? t('billing.confirmUpi')
                : state.method === 'cash'
                  ? t('billing.confirmCash')
                  : t('billing.confirm')}
            </Button>
            <Button mode="text" onPress={actions.closePayment} disabled={state.phase === 'submitting'}>
              {t('common.back')}
            </Button>
          </ScrollView>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  muted: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center' },
  totals: { alignItems: 'flex-end', gap: spacing.xs },
  entry: { textAlign: 'right' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.xs },
  key: { width: '32%' },
  wide: { width: '65%' },
  keyContent: { minHeight: 56 },
  keyLabel: { fontSize: 22 },
  pay: { margin: spacing.md },
  payContent: { minHeight: 56 },
  sheet: { margin: spacing.md, borderRadius: 12, maxHeight: '90%' },
  sheetBody: { padding: spacing.md, gap: spacing.sm },
  qr: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  center: { textAlign: 'center' },
});
