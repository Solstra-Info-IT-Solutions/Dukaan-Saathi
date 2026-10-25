import { formatPaise, paise } from '@ds/domain-core';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Chip,
  HelperText,
  IconButton,
  List,
  SegmentedButtons,
  Text,
  TextInput,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import type { PaymentMethod } from '../../domain/entities/Purchases';
import {
  type PurchaseFormViewModelDeps,
  usePurchaseFormViewModel,
} from '../viewmodels/usePurchaseFormViewModel';

const money = (p: number) => formatPaise(paise(p));

export function PurchaseFormScreen({
  deps,
  shopId,
  deviceId,
  supplierId,
  onDone,
}: {
  deps: PurchaseFormViewModelDeps;
  shopId: string;
  deviceId: string;
  supplierId: string | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = usePurchaseFormViewModel(deps, shopId, deviceId, supplierId);
  const unit = (code: string) => t(`billing.units.${code}`, { defaultValue: code });

  if (state.loading) return <LoadingState />;

  if (state.result) {
    return (
      <View style={styles.container}>
        <Text variant="headlineSmall" accessibilityRole="header">
          {t('purchases.saved', {
            total: money(state.result.totalPaise),
            paid: money(state.result.paidPaise),
          })}
        </Text>
        {state.result.supplierBalancePaise !== null ? (
          <Text variant="bodyLarge">
            {t('purchases.owe', { amount: money(state.result.supplierBalancePaise) })}
          </Text>
        ) : null}
        <Button mode="contained" onPress={onDone}>
          {t('common.back')}
        </Button>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="titleMedium">{t('purchases.form.supplier')}</Text>
      <View style={styles.chips}>
        <Chip
          selected={state.supplierId === null}
          onPress={() => actions.setSupplierId(null)}
          showSelectedCheck
        >
          {t('purchases.form.noSupplier')}
        </Chip>
        {state.suppliers.map((s) => (
          <Chip
            key={s.id}
            selected={state.supplierId === s.id}
            onPress={() => actions.setSupplierId(s.id)}
            showSelectedCheck
          >
            {s.name}
          </Chip>
        ))}
      </View>
      <TextInput
        mode="outlined"
        dense
        label={t('purchases.form.invoiceNo')}
        accessibilityLabel={t('purchases.form.invoiceNo')}
        value={state.invoiceNo}
        onChangeText={actions.setInvoiceNo}
        maxLength={40}
      />

      <TextInput
        mode="outlined"
        dense
        left={<TextInput.Icon icon="magnify" />}
        label={t('billing.searchItems')}
        accessibilityLabel={t('billing.searchItems')}
        value={state.searchText}
        onChangeText={actions.setSearchText}
      />
      {state.results.length > 0 ? (
        <Card>
          {state.results.slice(0, 6).map((p) => (
            <List.Item key={p.id} title={p.name} onPress={() => actions.addProduct(p)} />
          ))}
        </Card>
      ) : null}

      {state.lines.map((l) => (
        <Card key={l.key} style={state.errorLine === l.key ? styles.errorCard : undefined}>
          <Card.Title
            title={l.name}
            right={() => (
              <IconButton
                icon="close"
                accessibilityLabel={t('purchases.form.removeLine', { name: l.name })}
                onPress={() => actions.removeLine(l.key)}
              />
            )}
          />
          <Card.Content style={styles.row}>
            <TextInput
              mode="outlined"
              dense
              style={styles.flex}
              keyboardType={l.allowsFraction ? 'decimal-pad' : 'number-pad'}
              label={t('purchases.form.quantity', { unit: unit(l.unitCode) })}
              accessibilityLabel={t('purchases.form.quantityFor', { name: l.name })}
              value={l.quantityText}
              onChangeText={(v) => actions.editLine(l.key, { quantityText: v })}
            />
            <TextInput
              mode="outlined"
              dense
              style={styles.flex}
              keyboardType="decimal-pad"
              label={t('purchases.form.cost', { unit: unit(l.unitCode) })}
              accessibilityLabel={t('purchases.form.costFor', { name: l.name })}
              value={l.costText}
              onChangeText={(v) => actions.editLine(l.key, { costText: v })}
            />
            <TextInput
              mode="outlined"
              dense
              style={styles.flex}
              keyboardType="decimal-pad"
              label={t('purchases.form.newPrice', { current: money(l.currentPricePaise) })}
              accessibilityLabel={t('purchases.form.newPriceFor', { name: l.name })}
              value={l.newPriceText}
              onChangeText={(v) => actions.editLine(l.key, { newPriceText: v })}
            />
          </Card.Content>
        </Card>
      ))}

      <Text variant="headlineSmall">{t('purchases.form.total', { amount: money(state.totalPaise) })}</Text>
      <TextInput
        mode="outlined"
        keyboardType="decimal-pad"
        label={state.supplierId ? t('purchases.form.paidNow') : t('purchases.form.paidFull')}
        accessibilityLabel={t('purchases.form.paidNow')}
        value={state.paidText}
        onChangeText={actions.setPaidText}
      />
      <SegmentedButtons
        value={state.method}
        onValueChange={(v) => actions.setMethod(v as PaymentMethod)}
        buttons={(['cash', 'upi', 'card', 'other'] as const).map((m) => ({
          value: m,
          label: t(`payments.${m}`),
        }))}
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
        {t('purchases.form.save')}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.xs },
  flex: { flex: 1 },
  errorCard: { borderColor: '#B3261E', borderWidth: 1 },
  button: { minHeight: 56 },
});
