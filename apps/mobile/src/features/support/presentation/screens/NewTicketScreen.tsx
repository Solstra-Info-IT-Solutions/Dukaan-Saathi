import { TICKET_CATEGORIES } from '@ds/contracts';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, HelperText, Text, TextInput } from 'react-native-paper';
import { Button } from '@/shared/components/Button';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/shared/theme/theme';
import { type SupportViewModelDeps, useNewTicketViewModel } from '../viewmodels/useSupportViewModels';

export function NewTicketScreen({
  deps,
  shopId,
  onSent,
}: {
  deps: SupportViewModelDeps;
  shopId: string;
  onSent: (ticketId: string) => void;
}) {
  const { t } = useTranslation();
  const { state, actions } = useNewTicketViewModel(deps, shopId, onSent);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="titleMedium">{t('support.category')}</Text>
      <View style={styles.chips}>
        {TICKET_CATEGORIES.map((c) => (
          <Chip
            key={c}
            selected={state.category === c}
            onPress={() => actions.setCategory(c)}
            showSelectedCheck
          >
            {t(`support.categories.${c}`)}
          </Chip>
        ))}
      </View>
      <TextInput
        mode="outlined"
        label={t('support.subject')}
        accessibilityLabel={t('support.subject')}
        value={state.subject}
        onChangeText={actions.setSubject}
        maxLength={120}
      />
      <TextInput
        mode="outlined"
        label={t('support.message')}
        accessibilityLabel={t('support.message')}
        value={state.body}
        onChangeText={actions.setBody}
        maxLength={2000}
        multiline
        numberOfLines={5}
      />
      <HelperText type="error" visible={state.errorKey !== null}>
        {state.errorKey ? t(state.errorKey) : ''}
      </HelperText>
      <Button
        mode="contained"
        onPress={actions.send}
        loading={state.sending}
        disabled={state.sending}
        contentStyle={styles.button}
      >
        {t('support.send')}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  button: { minHeight: 56 },
});
