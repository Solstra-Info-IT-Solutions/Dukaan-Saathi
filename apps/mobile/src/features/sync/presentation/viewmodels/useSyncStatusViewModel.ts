import { useCallback, useMemo, useState } from 'react';
import type { OutboxEntry } from '../../domain/entities/Sync';
import type {
  GetSyncQueue,
  RetryOperation,
  SyncQueue,
  SyncTrigger,
} from '../../domain/usecases/syncUseCases';
import { useSyncStore } from '../syncStore';

export interface SyncStatusViewModelDeps {
  getQueue: GetSyncQueue;
  retry: RetryOperation;
  trigger: SyncTrigger;
}

export type SyncChipState =
  | { kind: 'synced' }
  | { kind: 'syncing' }
  | { kind: 'waiting'; count: number; offline: boolean }
  | { kind: 'attention'; count: number };

/** Header chip text (OFFLINE_SYNC_DESIGN.md §7): attention first, then syncing, waiting, synced. */
export function chipState(
  s: { pending: number; attention: number; syncing: boolean },
  online: boolean,
): SyncChipState {
  if (s.attention > 0) return { kind: 'attention', count: s.attention };
  if (s.syncing) return { kind: 'syncing' };
  if (s.pending > 0) return { kind: 'waiting', count: s.pending, offline: !online };
  return { kind: 'synced' };
}

/** Plain-language key for why an operation is waiting or was not applied. */
export function reasonKey(entry: Pick<OutboxEntry, 'status' | 'lastError'>): string | null {
  if (!entry.lastError) return null;
  if (entry.status === 'blocked') return `sync.reasons.${entry.lastError}`;
  if (entry.lastError.startsWith('DS_') || entry.lastError.startsWith('NETWORK_'))
    return `errors.${entry.lastError}`;
  return 'sync.reasons.TRY_AGAIN_LATER';
}

/** Sync status screen: what is waiting, what needs attention, sync now / try again. */
export function useSyncStatusViewModel(deps: SyncStatusViewModelDeps, shopId: string, userId: string) {
  const counts = useSyncStore();
  const [version, setVersion] = useState(0);
  // Read again after our own actions and whenever the service publishes new counts.
  const changeKey = `${version}|${counts.pending}|${counts.attention}|${counts.syncing}`;
  const queue = useMemo<SyncQueue>(() => {
    void changeKey;
    return deps.getQueue.execute(shopId, userId);
  }, [changeKey, deps, shopId, userId]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const syncNow = useCallback(async () => {
    await deps.trigger.syncNow();
    reload();
  }, [deps, reload]);
  const retry = useCallback(
    (id: string) => {
      deps.retry.execute(id);
      reload();
    },
    [deps, reload],
  );

  return {
    state: {
      ...queue,
      syncing: counts.syncing,
      lastSyncedAt: counts.lastSyncedAt,
      lastError: counts.lastError,
    },
    actions: { syncNow, retry, reload },
  };
}
