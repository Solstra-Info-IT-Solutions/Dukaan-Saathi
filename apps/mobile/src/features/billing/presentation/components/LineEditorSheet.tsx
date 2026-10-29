import { formatPaise, paise } from '@ds/domain-core';
import { ScrollView, StyleSheet } from 'react-native';
import { HelperText, Modal, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { Button } from '@/shared/components/Button';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/shared/theme/theme';
import type { useBillingViewModel } from '../viewmodels/useBillingViewModel';

type VM = ReturnType<typeof useBillingViewModel>;

/** Quantity, "amount worth" (loose items), price override and line discount of one product line. */
export function LineEditorSheet({ state, actions }: VM) {
  const { t } = useTranslation();
  const theme = useTheme();
  const editor = state.editor;
  const line = state.editorLine;
  const unit = line ? t(`billing.units.${line.unitCode}`, { defaultValue: line.unitCode }) : '';

  return (
    <Portal>
      <Modal
        visible={editor !== null && line !== undefined}
        onDismiss={actions.closeLine}
        contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}
      >
        {editor && line ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            <Text variant="titleLarge" accessibilityRole="header">
              {line.name}
            </Text>
            <Text variant="bodyMedium">
              {t('billing.pricePer', { price: formatPaise(paise(line.listPricePaise)), unit })}
            </Text>
            <TextInput
              mode="outlined"
              keyboardType={line.allowsFraction ? 'decimal-pad' : 'number-pad'}
              label={t('billing.quantityIn', { unit })}
              accessibilityLabel={t('billing.quantityIn', { unit })}
              value={editor.quantityText}
              onChangeText={(v) => actions.editLine({ quantityText: v, amountText: '' })}
            />
            <TextInput
              mode="outlined"
              keyboardType="decimal-pad"
              label={t('billing.amountWorth')}
              accessibilityLabel={t('billing.amountWorth')}
              value={editor.amountText}
              onChangeText={(v) => actions.editLine({ amountText: v })}
            />
            {state.canOverridePrice ? (
              <TextInput
                mode="outlined"
                keyboardType="decimal-pad"
                label={t('billing.priceOverride', { unit })}
                accessibilityLabel={t('billing.priceOverride', { unit })}
                value={editor.priceText}
                onChangeText={(v) => actions.editLine({ priceText: v })}
              />
            ) : null}
            {state.canDiscount ? (
              <TextInput
                mode="outlined"
                keyboardType="decimal-pad"
                label={t('billing.lineDiscount')}
                accessibilityLabel={t('billing.lineDiscount')}
                value={editor.discountText}
                onChangeText={(v) => actions.editLine({ discountText: v })}
              />
            ) : null}
            <HelperText type="error" visible={state.errorKey !== null}>
              {state.errorKey ? t(state.errorKey, state.errorParams) : ''}
            </HelperText>
            <Button mode="contained" onPress={actions.saveLine} contentStyle={styles.big}>
              {t('billing.saveLine')}
            </Button>
            <Button mode="text" textColor={theme.colors.error} onPress={() => actions.removeLine(editor.key)}>
              {t('billing.removeItem')}
            </Button>
          </ScrollView>
        ) : null}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheet: { margin: spacing.md, borderRadius: 12, maxHeight: '90%' },
  body: { padding: spacing.md, gap: spacing.sm },
  big: { minHeight: 56 },
});
