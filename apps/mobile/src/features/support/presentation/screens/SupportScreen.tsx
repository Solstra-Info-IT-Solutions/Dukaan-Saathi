import { FlatList, StyleSheet, View } from 'react-native';
import { FAB, List, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, LoadingState } from '@/shared/components/ScreenState';
import { spacing } from '@/shared/theme/theme';
import { type SupportViewModelDeps, useTicketsViewModel } from '../viewmodels/useSupportViewModels';

export const shortDate = (iso: string, lang: string) =>
  new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));

/** Help: the shop's questions to us and our answers. */
export function SupportScreen({
  deps,
  shopId,
  onNew,
  onOpen,
}: {
  deps: SupportViewModelDeps;
  shopId: string;
  onNew: () => void;
  onOpen: (ticketId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { state, actions } = useTicketsViewModel(deps, shopId);

  if (state.loadErrorKey) return <ErrorState messageKey={state.loadErrorKey} onRetry={actions.reload} />;
  if (state.loading) return <LoadingState />;
  if (state.tickets.length === 0) {
    return <EmptyState title={t('support.empty')} action={{ label: t('support.new'), onPress: onNew }} />;
  }

  return (
    <View style={styles.flex}>
      <FlatList
        data={state.tickets}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text variant="bodyMedium">{t('support.intro')}</Text>}
        renderItem={({ item }) => (
          <List.Item
            title={item.subject}
            description={`${t(`support.status.${item.status}`)} · ${shortDate(item.lastMessageAt, i18n.language)}`}
            left={(props) => (
              <List.Icon
                {...props}
                icon={item.status === 'waiting_shop' ? 'message-reply-text' : 'message-outline'}
              />
            )}
            onPress={() => onOpen(item.id)}
            accessibilityRole="button"
          />
        )}
      />
      <FAB
        icon="plus"
        label={t('support.new')}
        style={styles.fab}
        onPress={onNew}
        accessibilityLabel={t('support.new')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.md, paddingBottom: 96 },
  fab: { position: 'absolute', right: spacing.md, bottom: spacing.md },
});
