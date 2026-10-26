import { Chip } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useConnectivityStore } from '@/core/connectivity/connectivity';
import { useSyncStore } from '../syncStore';
import { chipState } from '../viewmodels/useSyncStatusViewModel';

/** Header chip: Synced · Offline · 7 waiting · Syncing… · Attention: 1. Opens the sync status screen. */
export function SyncChip({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const counts = useSyncStore();
  const online = useConnectivityStore((s) => s.isOnline);
  const s = chipState(counts, online);
  const label =
    s.kind === 'attention'
      ? t('sync.chip.attention', { count: s.count })
      : s.kind === 'syncing'
        ? t('sync.chip.syncing')
        : s.kind === 'waiting'
          ? t(s.offline ? 'sync.chip.offlineWaiting' : 'sync.chip.waiting', { count: s.count })
          : t(online ? 'sync.chip.synced' : 'sync.chip.offline');
  const icon =
    s.kind === 'attention'
      ? 'alert-circle-outline'
      : s.kind === 'syncing'
        ? 'sync'
        : s.kind === 'waiting' || !online
          ? 'cloud-off-outline'
          : 'cloud-check-outline';
  return (
    <Chip compact icon={icon} onPress={onPress} accessibilityLabel={label}>
      {label}
    </Chip>
  );
}
