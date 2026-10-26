// Public API of the sync feature (outbox, sync_push / sync_pull, offline copies, status UX).
export type { NewOutboxEntry, OutboxStore, SyncRemote, SyncState } from './domain/entities/Sync';
export {
  GetSyncQueue,
  PullChanges,
  PushOutbox,
  RetryOperation,
  type SyncTrigger,
} from './domain/usecases/syncUseCases';
export { SqliteSyncStore } from './data/datasources/local/SqliteSyncStore';
export { SupabaseSyncDataSource } from './data/datasources/remote/SupabaseSyncDataSource';
export { type SyncContext, SyncService } from './data/SyncService';
export { publishSyncState, useSyncStore } from './presentation/syncStore';
export { SyncChip } from './presentation/components/SyncChip';
export { SyncStatusScreen } from './presentation/screens/SyncStatusScreen';
export type { SyncStatusViewModelDeps } from './presentation/viewmodels/useSyncStatusViewModel';
