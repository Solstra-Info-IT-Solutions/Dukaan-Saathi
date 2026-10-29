import { EXPENSE_CATEGORIES } from '@ds/contracts';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Chip, HelperText, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { Button } from '@/shared/components/Button';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/shared/theme/theme';
import type { ExpenseMethod } from '../../domain/entities/Expense';
import {
  type ExpenseFormViewModelDeps,
  useExpenseFormViewModel,
} from '../viewmodels/useExpenseFormViewModel';

export function ExpenseFormScreen({
  deps,
  shopId,
  deviceId,
  onSaved,
}: {
  deps: ExpenseFormViewModelDeps;
  shopId: string;
  deviceId: string;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useExpenseFormViewModel(deps, shopId, deviceId, onSaved);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="titleMedium">{t('expenses.category')}</Text>
      <View style={styles.chips}>
        {EXPENSE_CATEGORIES.map((c) => (
          <Chip
            key={c}
            selected={state.category === c}
            onPress={() => actions.setCategory(c)}
            showSelectedCheck
          >
            {t(`expenses.categories.${c}`)}
          </Chip>
        ))}
      </View>
      <TextInput
        mode="outlined"
        keyboardType="decimal-pad"
        label={t('expenses.amount')}
        accessibilityLabel={t('expenses.amount')}
        value={state.amountText}
        onChangeText={actions.setAmountText}
      />
      <SegmentedButtons
        value={state.method}
        onValueChange={(v) => actions.setMethod(v as ExpenseMethod)}
        buttons={(['cash', 'upi', 'card', 'other'] as const).map((m) => ({
          value: m,
          label: t(`payments.${m}`),
        }))}
      />
      <TextInput
        mode="outlined"
        label={t('expenses.note')}
        accessibilityLabel={t('expenses.note')}
        value={state.note}
        onChangeText={actions.setNote}
        maxLength={200}
      />
      {state.photo ? (
        <View style={styles.photoRow}>
          <Image
            source={{ uri: state.photo.uri }}
            style={styles.photo}
            accessibilityLabel={t('expenses.photo')}
          />
          <Button onPress={actions.removePhoto}>{t('expenses.removePhoto')}</Button>
        </View>
      ) : (
        <View style={styles.photoRow}>
          <Button mode="outlined" icon="camera" onPress={() => void actions.takePhoto()}>
            {t('expenses.takePhoto')}
          </Button>
          <Button mode="text" icon="image" onPress={() => void actions.choosePhoto()}>
            {t('expenses.choosePhoto')}
          </Button>
        </View>
      )}
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
        {t('expenses.save')}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  photo: { width: 96, height: 96, borderRadius: 8 },
  button: { minHeight: 56 },
});
