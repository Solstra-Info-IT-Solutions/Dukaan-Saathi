import { create } from 'zustand';
import { IDLE_SYNC_STATE, type SyncState } from '../domain/entities/Sync';

/** What the header chip and the status screen show; written only by the SyncService (via the container). */
export const useSyncStore = create<SyncState>(() => IDLE_SYNC_STATE);

export const publishSyncState = (state: SyncState) => useSyncStore.setState(state, true);
