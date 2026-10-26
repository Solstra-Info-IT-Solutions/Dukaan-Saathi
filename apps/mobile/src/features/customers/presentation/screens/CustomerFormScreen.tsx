import { ScrollView, StyleSheet } from 'react-native';
import { Button, HelperText, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/shared/theme/theme';
import {
  type CustomerFormViewModelDeps,
  useCustomerFormViewModel,
} from '../viewmodels/useCustomersViewModel';

export function CustomerFormScreen({
  deps,
  shopId,
  canManage,
  onSaved,
}: {
  deps: CustomerFormViewModelDeps;
  shopId: string;
  /** Owners and managers; cashiers only add name and phone. */
  canManage: boolean;
  onSaved: (customerId: string) => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useCustomerFormViewModel(deps, shopId, onSaved);
  const field = (label: string, value: string, onChange: (v: string) => void, extra: object = {}) => (
    <TextInput
      mode="outlined"
      label={label}
      accessibilityLabel={label}
      value={value}
      onChangeText={onChange}
      {...extra}
    />
  );
  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {field(t('customers.form.name'), state.name, actions.setName, { maxLength: 80 })}
      {field(t('customers.form.phone'), state.phoneText, actions.setPhoneText, { keyboardType: 'phone-pad' })}
      {canManage ? (
        <>
          {field(t('customers.form.opening'), state.openingText, actions.setOpeningText, {
            keyboardType: 'numbers-and-punctuation',
          })}
          <HelperText type="info">{t('customers.form.openingHint')}</HelperText>
          {field(t('customers.form.creditLimit'), state.creditLimitText, actions.setCreditLimitText, {
            keyboardType: 'decimal-pad',
          })}
        </>
      ) : null}
      {field(t('expenses.note'), state.note, actions.setNote, { maxLength: 200 })}
      <HelperText type="error" visible={state.errorKey !== null}>
        {state.errorKey ? t(state.errorKey) : ''}
      </HelperText>
      <Button
        mode="contained"
        onPress={actions.save}
        loading={state.saving}
        disabled={state.saving}
        contentStyle={styles.button}
      >
        {t('customers.form.save')}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  button: { minHeight: 48 },
});
