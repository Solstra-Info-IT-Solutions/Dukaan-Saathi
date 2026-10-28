import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Surface, Text, TextInput, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import { type SupportViewModelDeps, useTicketThreadViewModel } from '../viewmodels/useSupportViewModels';
import { shortDate } from './SupportScreen';

export function TicketScreen({
  deps,
  shopId,
  ticketId,
}: {
  deps: SupportViewModelDeps;
  shopId: string;
  ticketId: string;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { state, actions } = useTicketThreadViewModel(deps, shopId, ticketId);

  if (state.loadErrorKey) return <ErrorState messageKey={state.loadErrorKey} onRetry={actions.reload} />;
  if (state.loading || !state.ticket) return <LoadingState />;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="titleMedium" accessibilityRole="header">
        {state.ticket.subject}
      </Text>
      <Text variant="bodySmall">{t(`support.status.${state.ticket.status}`)}</Text>
      {state.messages.map((m) => {
        const ours = m.authorKind === 'shop';
        return (
          <Surface
            key={m.id}
            elevation={0}
            style={[
              styles.message,
              ours ? styles.ours : styles.theirs,
              {
                backgroundColor: ours ? theme.colors.primaryContainer : theme.colors.surfaceVariant,
              },
            ]}
          >
            <Text variant="labelSmall">
              {ours ? t('support.you') : t('support.team')} · {shortDate(m.createdAt, i18n.language)}
            </Text>
            <Text variant="bodyMedium">{m.body}</Text>
          </Surface>
        );
      })}
      {state.canReply ? (
        <View style={styles.reply}>
          <TextInput
            mode="outlined"
            label={t('support.reply')}
            accessibilityLabel={t('support.reply')}
            value={state.reply}
            onChangeText={actions.setReply}
            maxLength={2000}
            multiline
          />
          <HelperText type="error" visible={state.errorKey !== null}>
            {state.errorKey ? t(state.errorKey) : ''}
          </HelperText>
          <Button mode="contained" onPress={actions.send} loading={state.sending} disabled={state.sending}>
            {t('support.send')}
          </Button>
        </View>
      ) : (
        <Text variant="bodySmall">{t('support.closedNote')}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  message: { padding: spacing.sm, borderRadius: 12, maxWidth: '85%', gap: 2 },
  ours: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  reply: { gap: spacing.xs, marginTop: spacing.sm },
});
