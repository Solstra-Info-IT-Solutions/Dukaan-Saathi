import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, HelperText, List, Switch, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import {
  type ShopSettingsViewModelDeps,
  useShopSettingsViewModel,
} from '../viewmodels/useShopSettingsViewModel';

export function ShopSettingsScreen({ deps, shopId }: { deps: ShopSettingsViewModelDeps; shopId: string }) {
  const { t } = useTranslation();
  const { state, actions } = useShopSettingsViewModel(deps, shopId);

  if (state.status === 'loading' || (state.status === 'loaded' && !state.draft)) return <LoadingState />;
  if (state.status === 'error' || !state.draft) {
    return <ErrorState messageKey={state.loadErrorKey ?? 'errors.UNKNOWN'} onRetry={actions.retry} />;
  }
  const d = state.draft;
  const fieldError = (key: string) => {
    const code = state.fieldErrors[key];
    return code ? t(`settings.errors.${code}`, { defaultValue: t('errors.DS_VALIDATION_FAILED') }) : '';
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="headlineSmall" accessibilityRole="header">
        {t('settings.title')}
      </Text>

      <TextInput
        mode="outlined"
        label={t('settings.invoicePrefix')}
        accessibilityLabel={t('settings.invoicePrefix')}
        value={d.invoicePrefix}
        autoCapitalize="characters"
        maxLength={6}
        onChangeText={(v) => actions.change('invoicePrefix', v)}
        error={!!state.fieldErrors.invoicePrefix}
      />
      <HelperText type={state.fieldErrors.invoicePrefix ? 'error' : 'info'} visible>
        {fieldError('invoicePrefix') || t('settings.invoicePrefixHelp')}
      </HelperText>

      <TextInput
        mode="outlined"
        label={t('settings.upiVpa')}
        accessibilityLabel={t('settings.upiVpa')}
        value={d.upiVpa}
        autoCapitalize="none"
        placeholder="shopname@okaxis"
        onChangeText={(v) => actions.change('upiVpa', v)}
        error={!!state.fieldErrors.upiVpa}
      />
      <HelperText type="error" visible={!!state.fieldErrors.upiVpa}>
        {fieldError('upiVpa')}
      </HelperText>

      <Text variant="titleSmall">{t('settings.paymentMethods')}</Text>
      <View style={styles.chips}>
        {state.paymentMethods.map((m) => (
          <Chip
            key={m}
            selected={d.enabledPaymentMethods.includes(m)}
            onPress={() => actions.togglePaymentMethod(m)}
            accessibilityState={{ selected: d.enabledPaymentMethods.includes(m) }}
          >
            {t(`payments.${m}`)}
          </Chip>
        ))}
      </View>
      <HelperText type="error" visible={!!state.fieldErrors.enabledPaymentMethods}>
        {fieldError('enabledPaymentMethods')}
      </HelperText>

      <List.Item
        title={t('settings.roundOff')}
        description={t('settings.roundOffHelp')}
        right={() => (
          <Switch
            value={d.roundOffEnabled}
            onValueChange={(v) => actions.change('roundOffEnabled', v)}
            accessibilityLabel={t('settings.roundOff')}
          />
        )}
      />

      <View style={styles.row}>
        <TextInput
          mode="outlined"
          style={styles.half}
          label={t('settings.cashierDiscount')}
          accessibilityLabel={t('settings.cashierDiscount')}
          value={d.cashierDiscountPercent}
          keyboardType="decimal-pad"
          right={<TextInput.Affix text="%" />}
          onChangeText={(v) => actions.change('cashierDiscountPercent', v)}
          error={!!state.fieldErrors.cashierDiscountLimitBp}
        />
        <TextInput
          mode="outlined"
          style={styles.half}
          label={t('settings.managerDiscount')}
          accessibilityLabel={t('settings.managerDiscount')}
          value={d.managerDiscountPercent}
          keyboardType="decimal-pad"
          right={<TextInput.Affix text="%" />}
          onChangeText={(v) => actions.change('managerDiscountPercent', v)}
          error={!!state.fieldErrors.managerDiscountLimitBp}
        />
      </View>
      <HelperText
        type="error"
        visible={!!(state.fieldErrors.cashierDiscountLimitBp || state.fieldErrors.managerDiscountLimitBp)}
      >
        {t('settings.errors.DISCOUNT_RANGE')}
      </HelperText>

      <HelperText type="error" visible={state.saveErrorKey !== null}>
        {state.saveErrorKey ? t(state.saveErrorKey) : ''}
      </HelperText>
      <Button
        mode="contained"
        onPress={actions.submit}
        loading={state.saving}
        disabled={!state.dirty || state.saving}
        contentStyle={styles.button}
      >
        {state.saved && !state.dirty ? t('settings.saved') : t('settings.save')}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  button: { minHeight: 48, marginTop: spacing.sm },
});
