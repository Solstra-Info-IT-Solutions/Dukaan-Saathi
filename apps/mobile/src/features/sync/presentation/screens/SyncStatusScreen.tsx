import { ScrollView, StyleSheet } from 'react-native';
import { List, Text } from 'react-native-paper';
import { Button } from '@/shared/components/Button';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/shared/theme/theme';
import type { OutboxEntry } from '../../domain/entities/Sync';
import {
  reasonKey,
  type SyncStatusViewModelDeps,
  useSyncStatusViewModel,
} from '../viewmodels/useSyncStatusViewModel';

/** What is waiting on this phone and what needs attention, in plain words (OFFLINE_SYNC_DESIGN.md §7). */
export function SyncStatusScreen({
  deps,
  shopId,
  userId,
  onOpenSale,
}: {
  deps: SyncStatusViewModelDeps;
  shopId: string;
  userId: string;
  onOpenSale: (saleId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { state, actions } = useSyncStatusViewModel(deps, shopId, userId);
  const time = new Intl.DateTimeFormat(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
  const open = (e: OutboxEntry) => {
    const saleId = e.operation === 'create_sale' ? e.payload.saleId : null;
    return typeof saleId === 'string' ? () => onOpenSale(saleId) : undefined;
  };
  const title = (e: OutboxEntry) => [t(`sync.ops.${e.operation}`), e.label].filter(Boolean).join(' · ');

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="bodyMedium">
        {state.lastSyncedAt
          ? t('sync.lastSynced', { time: time.format(new Date(state.lastSyncedAt)) })
          : t('sync.neverSynced')}
      </Text>
      {state.lastError ? <Text variant="bodyMedium">{t(`errors.${state.lastError}`)}</Text> : null}
      <Button
        mode="contained"
        icon="sync"
        onPress={actions.syncNow}
        loading={state.syncing}
        disabled={state.syncing}
      >
        {t('sync.syncNow')}
      </Button>

      <Text variant="titleMedium" accessibilityRole="header">
        {t('sync.waiting', { count: state.waiting.length })}
      </Text>
      {state.waiting.length === 0 ? <Text variant="bodyMedium">{t('sync.nothingWaiting')}</Text> : null}
      {state.waiting.map((e) => {
        const why = reasonKey(e);
        return (
          <List.Item
            key={e.id}
            title={title(e)}
            description={[time.format(new Date(e.createdAt)), why ? t(why) : null]
              .filter(Boolean)
              .join(' · ')}
            onPress={open(e)}
          />
        );
      })}

      <Text variant="titleMedium" accessibilityRole="header">
        {t('sync.attention')}
      </Text>
      {state.attention.length === 0 ? <Text variant="bodyMedium">{t('sync.nothingAttention')}</Text> : null}
      {state.attention.map((e) => {
        const why = reasonKey(e);
        const failed = e.status === 'quarantined' || e.status === 'blocked';
        return (
          <List.Item
            key={e.id}
            title={title(e)}
            description={
              failed
                ? `${t('sync.notSaved')}${why ? `: ${t(why)}` : ''}`
                : `${t('sync.savedFlagged')}: ${e.reviewReasons.map((r) => t(`sync.review.${r}`)).join(', ')}`
            }
            onPress={open(e)}
            right={() =>
              failed ? (
                <Button mode="text" onPress={() => actions.retry(e.id)}>
                  {t('sync.retry')}
                </Button>
              ) : null
            }
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
});
