import { formatQuantity, quantityMilli } from '@ds/domain-core';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Banner,
  Card,
  Dialog,
  Divider,
  HelperText,
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
} from 'react-native-paper';
import { Button } from '@/shared/components/Button';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import { buildReceipt, type ReceiptLabels } from '../../domain/receipt';
import { type ReceiptViewModelDeps, useReceiptViewModel } from '../viewmodels/useReceiptViewModel';

/** Localised receipt labels; dates in the shop's time zone (IST). */
function useReceiptLabels(): ReceiptLabels {
  const { t, i18n } = useTranslation();
  return useMemo(
    () => ({
      bill: t('billing.receipt.bill'),
      subtotal: t('billing.receipt.subtotal'),
      discount: t('billing.discount'),
      roundOff: t('billing.roundOff'),
      total: t('billing.total'),
      paid: t('billing.receipt.paid'),
      cgst: t('billing.receipt.cgst'),
      sgst: t('billing.receipt.sgst'),
      gstin: t('billing.receipt.gstin'),
      billOfSupply: t('billing.receipt.billOfSupply'),
      item: t('billing.receipt.item'),
      thanks: t('billing.receipt.thanks'),
      upiConfirmedByShop: t('billing.receipt.upiConfirmedByShop'),
      taxInvoice: t('billing.receipt.taxInvoice'),
      hsn: t('billing.receipt.hsn'),
      voided: t('billing.receipt.voided'),
      returned: t('billing.receipt.returned'),
      onUdhaar: t('billing.receipt.onUdhaar'),
      customer: t('billing.receipt.customer'),
      method: (m: string) => t(`payments.${m}`),
      unit: (code: string) => t(`billing.units.${code}`, { defaultValue: code }),
      formatDate: (iso: string) =>
        new Intl.DateTimeFormat(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Asia/Kolkata',
        }).format(new Date(iso)),
    }),
    [t, i18n.language],
  );
}

export function ReceiptScreen({
  deps,
  shopId,
  saleId,
  deviceId,
  canVoid,
  canReturn,
  onNewBill,
}: {
  deps: ReceiptViewModelDeps;
  shopId: string;
  saleId: string;
  deviceId: string;
  canVoid: boolean;
  canReturn: boolean;
  onNewBill: () => void;
}) {
  const { t } = useTranslation();
  const labels = useReceiptLabels();
  const { state, actions } = useReceiptViewModel(deps, shopId, saleId, deviceId);

  if (state.loading) return <LoadingState />;
  if (state.loadErrorKey || !state.sale) {
    return <ErrorState messageKey={state.loadErrorKey ?? 'errors.UNKNOWN'} onRetry={actions.reload} />;
  }
  const r = buildReceipt(state.sale, labels);
  const voided = state.sale.status === 'voided';
  // Saved on this phone only: no void or return until the server has the bill.
  const local = state.sale.local ?? null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {voided ? (
        <Banner visible icon="cancel">
          {r.voided}
        </Banner>
      ) : null}
      {local ? (
        <Banner visible icon={local.state === 'pending' ? 'cloud-upload-outline' : 'alert-circle-outline'}>
          {local.state === 'pending' ? t('billing.receipt.savedOnPhone') : t('billing.receipt.notSynced')}
        </Banner>
      ) : null}
      {state.sale.status === 'needs_review' ? (
        <Banner visible icon="flag-outline">
          {t('billing.receipt.needsReview', {
            reasons: state.sale.reviewReasons.map((x) => t(`sync.review.${x}`)).join(', '),
          })}
        </Banner>
      ) : null}
      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="titleLarge" style={styles.center} accessibilityRole="header">
            {r.shopName}
          </Text>
          {r.title ? (
            <Text variant="titleSmall" style={styles.center}>
              {r.title}
            </Text>
          ) : null}
          {r.shopAddress ? (
            <Text variant="bodySmall" style={styles.center}>
              {r.shopAddress}
            </Text>
          ) : null}
          <Text variant="bodyMedium">
            {labels.bill}: {r.invoiceNumber}
          </Text>
          <Text variant="bodySmall">{r.date}</Text>
          <Divider />
          {r.lines.map((l, i) => (
            <View key={i} style={styles.row}>
              <Text variant="bodyMedium" style={styles.flex}>
                {l.label}
              </Text>
              <Text variant="bodyMedium">{l.amount}</Text>
            </View>
          ))}
          <Divider />
          {r.totals.map((l) => (
            <View key={l.label} style={styles.row}>
              <Text variant="bodyMedium" style={styles.flex}>
                {l.label}
              </Text>
              <Text variant="bodyMedium">{l.amount}</Text>
            </View>
          ))}
          <View style={styles.row}>
            <Text variant="titleLarge" style={styles.flex}>
              {labels.total}
            </Text>
            <Text variant="titleLarge">{r.total}</Text>
          </View>
          {r.payments.length ? (
            <Text variant="bodySmall">
              {labels.paid}: {r.payments.join(', ')}
            </Text>
          ) : null}
          {r.udhaar ? <Text variant="bodyMedium">{r.udhaar}</Text> : null}
          {r.customer ? <Text variant="bodyMedium">{r.customer}</Text> : null}
          {r.returns.map((x) => (
            <Text key={x} variant="bodySmall">
              {x}
            </Text>
          ))}
          {r.footer.map((f) => (
            <Text key={f} variant="bodySmall" style={styles.center}>
              {f}
            </Text>
          ))}
        </Card.Content>
      </Card>

      <HelperText type="error" visible={state.errorKey !== null && !state.voidOpen && !state.returnOpen}>
        {state.errorKey ? t(state.errorKey) : ''}
      </HelperText>
      <Button
        mode="contained"
        icon="whatsapp"
        onPress={() => actions.shareText(labels)}
        loading={state.sharing === 'text'}
        disabled={state.sharing !== null}
        contentStyle={styles.button}
      >
        {t('billing.receipt.shareWhatsapp')}
      </Button>
      <Button
        mode="outlined"
        icon="file-pdf-box"
        onPress={() => actions.sharePdf(labels)}
        loading={state.sharing === 'pdf'}
        disabled={state.sharing !== null}
        contentStyle={styles.button}
      >
        {t('billing.receipt.sharePdf')}
      </Button>
      <Button mode="contained-tonal" icon="plus" onPress={onNewBill} contentStyle={styles.button}>
        {t('billing.receipt.newBill')}
      </Button>
      {canReturn && !voided && !local && state.returnable.length > 0 ? (
        <Button mode="text" icon="keyboard-return" onPress={actions.openReturn} contentStyle={styles.button}>
          {t('billing.returns.button')}
        </Button>
      ) : null}
      {canVoid && !voided && !local ? (
        <Button mode="text" icon="cancel" onPress={actions.openVoid} contentStyle={styles.button}>
          {t('billing.void.button')}
        </Button>
      ) : null}

      <Portal>
        <Dialog visible={state.returnOpen} onDismiss={state.returning ? undefined : actions.closeReturn}>
          <Dialog.Title>{t('billing.returns.title')}</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={styles.dialogBody} keyboardShouldPersistTaps="handled">
              <Text variant="bodySmall">{t('billing.returns.hint')}</Text>
              {state.returnable.map(({ line, leftMilli }) => {
                const name = line.label ?? t('billing.item', { number: line.lineNo });
                return (
                  <TextInput
                    key={line.lineNo}
                    mode="outlined"
                    dense
                    keyboardType="decimal-pad"
                    label={t('billing.returns.quantity', {
                      name,
                      left: formatQuantity(quantityMilli(leftMilli)),
                    })}
                    accessibilityLabel={t('billing.returns.quantityFor', { name })}
                    value={state.returnQty[line.lineNo] ?? ''}
                    onChangeText={(v) => actions.setReturnQty(line.lineNo, v)}
                  />
                );
              })}
              <Text variant="bodyMedium">{t('billing.returns.refundBy')}</Text>
              <SegmentedButtons
                value={state.refundMethod}
                onValueChange={(v) => actions.setRefundMethod(v as typeof state.refundMethod)}
                buttons={state.refundMethods.map((m) => ({
                  value: m,
                  label: t(`payments.${m}`),
                }))}
              />
              <TextInput
                mode="outlined"
                label={t('billing.void.reason')}
                accessibilityLabel={t('billing.returns.reason')}
                value={state.returnReason}
                onChangeText={actions.setReturnReason}
                maxLength={200}
              />
              <HelperText type="error" visible={state.errorKey !== null}>
                {state.errorKey ? t(state.errorKey) : ''}
              </HelperText>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={actions.closeReturn} disabled={state.returning}>
              {t('common.cancel')}
            </Button>
            <Button onPress={actions.confirmReturn} loading={state.returning} disabled={state.returning}>
              {t('billing.returns.confirm')}
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={state.voidOpen} onDismiss={state.voiding ? undefined : actions.closeVoid}>
          <Dialog.Title>{t('billing.void.title', { invoice: r.invoiceNumber })}</Dialog.Title>
          <Dialog.Content style={styles.gap}>
            <Text variant="bodyMedium">{t('billing.void.body')}</Text>
            <TextInput
              mode="outlined"
              label={t('billing.void.reason')}
              accessibilityLabel={t('billing.void.reason')}
              value={state.reason}
              onChangeText={actions.setReason}
              maxLength={200}
            />
            <HelperText type="error" visible={state.errorKey !== null}>
              {state.errorKey ? t(state.errorKey) : ''}
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={actions.closeVoid} disabled={state.voiding}>
              {t('common.cancel')}
            </Button>
            <Button onPress={actions.confirmVoid} loading={state.voiding} disabled={state.voiding}>
              {t('billing.void.confirm')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  gap: { gap: spacing.xs },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  button: { minHeight: 48 },
  dialogBody: { gap: spacing.sm, paddingVertical: spacing.sm },
});
