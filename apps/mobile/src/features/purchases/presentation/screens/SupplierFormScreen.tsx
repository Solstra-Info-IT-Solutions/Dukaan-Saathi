import { ScrollView, StyleSheet } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';
import { Button } from '@/shared/components/Button';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/shared/theme/theme';
import {
  type SupplierFormViewModelDeps,
  useSupplierFormViewModel,
} from '../viewmodels/useSuppliersViewModel';

export function SupplierFormScreen({
  deps,
  shopId,
  onSaved,
}: {
  deps: SupplierFormViewModelDeps;
  shopId: string;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useSupplierFormViewModel(deps, shopId, onSaved);
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
      {field(t('purchases.form.name'), state.name, actions.setName, { maxLength: 80 })}
      {field(t('purchases.form.phone'), state.phoneText, actions.setPhoneText, { keyboardType: 'phone-pad' })}
      {field(t('purchases.form.opening'), state.openingText, actions.setOpeningText, {
        keyboardType: 'decimal-pad',
      })}
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
        {t('purchases.form.save')}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  button: { minHeight: 48 },
});
