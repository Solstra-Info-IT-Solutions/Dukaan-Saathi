import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Banner,
  Button,
  Card,
  Dialog,
  Divider,
  HelperText,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';
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
  canVoid,
  onNewBill,
}: {
  deps: ReceiptViewModelDeps;
  shopId: string;
  saleId: string;
  canVoid: boolean;
  onNewBill: () => void;
}) {
  const { t } = useTranslation();
  const labels = useReceiptLabels();
  const { state, actions } = useReceiptViewModel(deps, shopId, saleId);

  if (state.loading) return <LoadingState />;
  if (state.loadErrorKey || !state.sale) {
    return <ErrorState messageKey={state.loadErrorKey ?? 'errors.UNKNOWN'} onRetry={actions.reload} />;
  }
  const r = buildReceipt(state.sale, labels);
  const voided = state.sale.status === 'voided';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {voided ? (
        <Banner visible icon="cancel">
          {r.voided}
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
          {r.footer.map((f) => (
            <Text key={f} variant="bodySmall" style={styles.center}>
              {f}
            </Text>
          ))}
        </Card.Content>
      </Card>

      <HelperText type="error" visible={state.errorKey !== null && !state.voidOpen}>
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
      {canVoid && !voided ? (
        <Button mode="text" icon="cancel" onPress={actions.openVoid} contentStyle={styles.button}>
          {t('billing.void.button')}
        </Button>
      ) : null}

      <Portal>
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
});
