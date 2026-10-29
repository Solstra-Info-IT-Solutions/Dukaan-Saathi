import { Controller } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, HelperText, Text, TextInput } from 'react-native-paper';
import { Button } from '@/shared/components/Button';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { spacing } from '@/shared/theme/theme';
import type { ShopActivation } from '../../domain/entities/Shop';
import { type CreateShopViewModelDeps, useCreateShopViewModel } from '../viewmodels/useCreateShopViewModel';

export function CreateShopScreen({
  deps,
  onActivated,
  onCancel,
}: {
  deps: CreateShopViewModelDeps;
  onActivated: (activation: ShopActivation) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { form, state, actions } = useCreateShopViewModel(deps, onActivated);
  const { errors } = form.formState;
  const submitting = state.status === 'submitting';

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <BrandLogo variant="horizontal" width={200} style={styles.logo} />
      <Text variant="headlineSmall" accessibilityRole="header">
        {t('shops.create.title')}
      </Text>

      <Controller
        control={form.control}
        name="name"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            label={t('shops.create.name')}
            accessibilityLabel={t('shops.create.name')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={!!errors.name}
            autoFocus
          />
        )}
      />
      <HelperText type="error" visible={!!errors.name}>
        {errors.name?.message
          ? t(`shops.create.errors.${errors.name.message}`, {
              defaultValue: t('errors.DS_VALIDATION_FAILED'),
            })
          : ''}
      </HelperText>

      <Text variant="titleSmall">{t('shops.create.category')}</Text>
      <Controller
        control={form.control}
        name="businessCategory"
        render={({ field }) => (
          <View style={styles.chips} accessibilityRole="radiogroup">
            {state.categories.map((c) => (
              <Chip
                key={c}
                selected={field.value === c}
                onPress={() => field.onChange(c)}
                accessibilityRole="radio"
                accessibilityState={{ selected: field.value === c }}
              >
                {t(`shops.categories.${c}`)}
              </Chip>
            ))}
          </View>
        )}
      />

      <Controller
        control={form.control}
        name="city"
        render={({ field }) => (
          <TextInput
            mode="outlined"
            style={styles.city}
            label={t('shops.create.city')}
            accessibilityLabel={t('shops.create.city')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />

      <HelperText type="error" visible={state.errorKey !== null}>
        {state.errorKey ? t(state.errorKey) : ''}
      </HelperText>
      <Button
        mode="contained"
        onPress={actions.submit}
        loading={submitting}
        disabled={submitting}
        contentStyle={styles.button}
      >
        {t('shops.create.submit')}
      </Button>
      <Button mode="text" onPress={onCancel} disabled={submitting}>
        {t('common.back')}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Horizontal logo 1000×260 includes its own clear space on the right, so it sits left-aligned with the title.
  logo: { marginLeft: -6, marginBottom: spacing.sm },
  container: { padding: spacing.md, gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  city: { marginTop: spacing.md },
  button: { minHeight: 48 },
});
