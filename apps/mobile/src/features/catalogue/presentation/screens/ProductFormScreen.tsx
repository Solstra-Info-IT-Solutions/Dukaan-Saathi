import { Controller } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import type { ProductDraft } from '../../domain/entities/Catalogue';
import {
  type ProductFormViewModelDeps,
  useProductFormViewModel,
} from '../viewmodels/useProductFormViewModel';

type TextField = Exclude<keyof ProductDraft, 'id' | 'categoryId' | 'unitCode' | 'taxRateCode'>;

export function ProductFormScreen({
  deps,
  shopId,
  productId,
  onDone,
  initialBarcode,
}: {
  deps: ProductFormViewModelDeps;
  shopId: string;
  productId: string | null;
  onDone: () => void;
  initialBarcode?: string;
}) {
  const { t, i18n } = useTranslation();
  const { form, state, actions } = useProductFormViewModel(deps, shopId, productId, onDone, initialBarcode);
  const { errors } = form.formState;
  const lang = i18n.language === 'hi' ? 'hi' : 'en';

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error')
    return <ErrorState messageKey={state.loadErrorKey ?? 'errors.UNKNOWN'} onRetry={actions.retry} />;

  const fieldError = (name: TextField) => {
    const code = errors[name]?.message;
    return code ? t(`catalogue.errors.${code}`, { defaultValue: t('errors.DS_VALIDATION_FAILED') }) : '';
  };

  const textInput = (
    name: TextField,
    label: string,
    extra: Partial<React.ComponentProps<typeof TextInput>> = {},
  ) => (
    <View>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label={label}
            accessibilityLabel={label}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors[name]}
            {...extra}
          />
        )}
      />
      <HelperText type="error" visible={!!errors[name]}>
        {fieldError(name)}
      </HelperText>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="headlineSmall" accessibilityRole="header">
        {state.isNew ? t('catalogue.form.newTitle') : t('catalogue.form.editTitle')}
      </Text>

      {textInput('name', t('catalogue.form.name'))}
      {textInput('nameHi', t('catalogue.form.nameHi'))}
      <View style={styles.row}>
        <View style={styles.half}>
          {textInput('priceText', t('catalogue.form.price'), {
            keyboardType: 'decimal-pad',
            left: <TextInput.Affix text="₹" />,
          })}
        </View>
        <View style={styles.half}>
          {textInput('mrpText', t('catalogue.form.mrp'), {
            keyboardType: 'decimal-pad',
            left: <TextInput.Affix text="₹" />,
          })}
        </View>
      </View>

      <Text variant="titleSmall">{t('catalogue.form.unit')}</Text>
      <Controller
        control={form.control}
        name="unitCode"
        render={({ field }) => (
          <View style={styles.chips}>
            {state.units.map((u) => (
              <Chip key={u.code} selected={field.value === u.code} onPress={() => field.onChange(u.code)}>
                {u.label[lang] ?? u.label.en}
              </Chip>
            ))}
          </View>
        )}
      />

      {state.categories.length > 0 ? (
        <>
          <Text variant="titleSmall" style={styles.section}>
            {t('catalogue.form.category')}
          </Text>
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <View style={styles.chips}>
                {state.categories.map((c) => (
                  <Chip
                    key={c.id}
                    selected={field.value === c.id}
                    onPress={() => field.onChange(field.value === c.id ? null : c.id)}
                  >
                    {lang === 'hi' && c.nameHi ? c.nameHi : c.name}
                  </Chip>
                ))}
              </View>
            )}
          />
        </>
      ) : null}

      <Text variant="titleSmall" style={styles.section}>
        {t('catalogue.form.tax')}
      </Text>
      <Controller
        control={form.control}
        name="taxRateCode"
        render={({ field }) => (
          <View style={styles.chips}>
            <Chip selected={field.value === null} onPress={() => field.onChange(null)}>
              {t('catalogue.form.noTax')}
            </Chip>
            {state.taxRates.map((r) => (
              <Chip key={r.code} selected={field.value === r.code} onPress={() => field.onChange(r.code)}>
                {r.label}
              </Chip>
            ))}
          </View>
        )}
      />

      <View style={styles.section}>
        {textInput('barcodesText', t('catalogue.form.barcodes'), { autoCapitalize: 'none' })}
        {textInput('aliasesText', t('catalogue.form.aliases'))}
        {textInput('hsnCode', t('catalogue.form.hsn'), { keyboardType: 'number-pad' })}
      </View>

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
        {t('catalogue.form.save')}
      </Button>
      {!state.isNew ? (
        <Button mode="text" onPress={actions.askArchive} disabled={state.archiving} textColor="#B3261E">
          {t('catalogue.form.archive')}
        </Button>
      ) : null}

      <Portal>
        <Dialog visible={state.confirmArchive} onDismiss={actions.cancelArchive}>
          <Dialog.Title>{t('staff.confirm.title')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{t('catalogue.form.archiveConfirm')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={actions.cancelArchive}>{t('common.cancel')}</Button>
            <Button onPress={actions.confirmArchive}>{t('common.confirm')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.xs, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  section: { marginTop: spacing.md },
  button: { minHeight: 48 },
});
