import { formatPaise, paise } from '@ds/domain-core';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  HelperText,
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
import { spacing } from '@/shared/theme/theme';
import type { BillMethod } from '../../domain/entities/Bill';
import type { useBillingViewModel } from '../viewmodels/useBillingViewModel';

type VM = ReturnType<typeof useBillingViewModel>;
const money = (value: number) => formatPaise(paise(value));

/** Payment: one method, or a second method for part of the bill; cash change, UPI QR, udhaar customer. */
export function PaymentSheet({ state, actions }: VM) {
  const { t } = useTranslation();
  const theme = useTheme();
  const total = state.totals?.totalPaise ?? 0;
  const methodButtons = (except?: BillMethod | null) =>
    state.methods.filter((m) => m !== except).map((m) => ({ value: m, label: t(`payments.${m}`) }));
  const hasCash = state.payments?.some((p) => p.method === 'cash') ?? false;
  const hasUpi = state.payments?.some((p) => p.method === 'upi') ?? false;
  const needsCustomer = state.method === 'udhaar' || state.split?.method === 'udhaar';
  const confirmLabel = state.split
    ? t('billing.confirm')
    : state.method === 'udhaar'
      ? t('billing.confirmUdhaar')
      : state.method === 'upi'
        ? t('billing.confirmUpi')
        : state.method === 'cash'
          ? t('billing.confirmCash')
          : t('billing.confirm');

  return (
    <Portal>
      <Modal
        visible={state.phase !== 'editing'}
        onDismiss={state.phase === 'submitting' ? undefined : actions.closePayment}
        contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Text variant="headlineSmall" accessibilityRole="header">
            {t('billing.total')}: {money(total)}
          </Text>
          <SegmentedButtons
            value={state.method ?? ''}
            onValueChange={(m) => actions.selectMethod(m as BillMethod)}
            buttons={methodButtons()}
          />
          {state.methods.length > 1 && total > 0 ? (
            <Button mode="text" icon={state.split ? 'close' : 'call-split'} onPress={actions.toggleSplit}>
              {state.split ? t('billing.noSplit') : t('billing.split')}
            </Button>
          ) : null}
          {state.split ? (
            <View style={styles.gap}>
              <Text variant="bodyMedium">
                {t('billing.splitHint', { method: t(`payments.${state.method ?? 'cash'}`) })}
              </Text>
              <SegmentedButtons
                value={state.split.method}
                onValueChange={(m) => actions.setSplitMethod(m as BillMethod)}
                buttons={methodButtons(state.method)}
              />
              <TextInput
                mode="outlined"
                keyboardType="decimal-pad"
                label={t('billing.splitAmount', { method: t(`payments.${state.split.method}`) })}
                accessibilityLabel={t('billing.splitAmount', { method: t(`payments.${state.split.method}`) })}
                value={state.split.amountText}
                onChangeText={actions.setSplitAmount}
              />
              {state.payments ? (
                <Text variant="bodyMedium">
                  {state.payments
                    .map((p) => `${t(`payments.${p.method}`)} ${money(p.amountPaise)}`)
                    .join(' + ')}
                </Text>
              ) : (
                <HelperText type="error">{t('billing.errors.INVALID_SPLIT')}</HelperText>
              )}
            </View>
          ) : null}
          {needsCustomer ? (
            <View style={styles.gap}>
              <Text variant="titleMedium">
                {t('billing.udhaarFor', { amount: money(state.udhaarPaise) })}
              </Text>
              {state.customer ? (
                <>
                  <List.Item
                    title={state.customer.name}
                    description={t('billing.customerBalance', { amount: money(state.customer.balancePaise) })}
                    right={() => (
                      <Button mode="text" onPress={() => actions.pickCustomer(null)}>
                        {t('billing.changeCustomer')}
                      </Button>
                    )}
                  />
                  {state.overLimit ? (
                    <HelperText type="info">
                      {t('billing.overLimit', { amount: money(state.customer.creditLimitPaise ?? 0) })}
                    </HelperText>
                  ) : null}
                </>
              ) : state.newCustomer ? (
                <>
                  <TextInput
                    mode="outlined"
                    label={t('customers.form.name')}
                    accessibilityLabel={t('customers.form.name')}
                    value={state.newCustomer.name}
                    onChangeText={(name) => actions.editNewCustomer({ name })}
                    maxLength={80}
                  />
                  <TextInput
                    mode="outlined"
                    keyboardType="phone-pad"
                    label={t('customers.form.phone')}
                    accessibilityLabel={t('customers.form.phone')}
                    value={state.newCustomer.phoneText}
                    onChangeText={(phoneText) => actions.editNewCustomer({ phoneText })}
                  />
                  <View style={styles.row}>
                    <Button mode="text" onPress={actions.cancelNewCustomer}>
                      {t('common.cancel')}
                    </Button>
                    <Button
                      mode="contained-tonal"
                      onPress={actions.saveNewCustomer}
                      loading={state.addingCustomer}
                      disabled={state.addingCustomer}
                    >
                      {t('billing.addCustomer')}
                    </Button>
                  </View>
                </>
              ) : (
                <>
                  <TextInput
                    mode="outlined"
                    label={t('billing.findCustomer')}
                    accessibilityLabel={t('billing.findCustomer')}
                    value={state.customerText}
                    onChangeText={actions.setCustomerText}
                  />
                  {state.customerResults.map((c) => (
                    <List.Item
                      key={c.id}
                      title={c.name}
                      description={[c.phone, t('billing.customerBalance', { amount: money(c.balancePaise) })]
                        .filter(Boolean)
                        .join(' · ')}
                      onPress={() => actions.pickCustomer(c)}
                    />
                  ))}
                  {state.canAddCustomer ? (
                    <Button mode="text" icon="account-plus-outline" onPress={actions.startNewCustomer}>
                      {t('billing.newCustomer')}
                    </Button>
                  ) : null}
                </>
              )}
            </View>
          ) : null}
          {hasCash ? (
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
          {hasUpi ? (
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
          <HelperText type="error" visible={state.errorKey !== null}>
            {state.errorKey ? t(state.errorKey, state.errorParams) : ''}
          </HelperText>
          <Button
            mode="contained"
            onPress={actions.submit}
            loading={state.phase === 'submitting'}
            disabled={state.phase === 'submitting' || !state.method || !state.payments}
            contentStyle={styles.big}
          >
            {confirmLabel}
          </Button>
          <Button mode="text" onPress={actions.closePayment} disabled={state.phase === 'submitting'}>
            {t('common.back')}
          </Button>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheet: { margin: spacing.md, borderRadius: 12, maxHeight: '90%' },
  body: { padding: spacing.md, gap: spacing.sm },
  gap: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  qr: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  center: { textAlign: 'center' },
  big: { minHeight: 56 },
});
