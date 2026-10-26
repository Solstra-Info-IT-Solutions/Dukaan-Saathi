import { IDLE_SYNC_STATE, type SyncState } from '../domain/entities/Sync';
import { type PullChanges, type PushOutbox, summarize } from '../domain/usecases/syncUseCases';
import type { SqliteSyncStore } from './datasources/local/SqliteSyncStore';

export interface SyncContext {
  shopId: string;
  deviceId: string;
  userId: string;
}

/**
 * Runs the outbox (OFFLINE_SYNC_DESIGN.md §5): on start, when the phone comes online, after each local write
 * (`nudge`) and every minute while something is waiting. One run at a time; push first, then pull.
 * Publishes counts for the header chip; ViewModels never run sync logic themselves.
 */
export class SyncService {
  private context: SyncContext | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;
  private state: SyncState = IDLE_SYNC_STATE;

  constructor(
    private readonly deps: {
      push: PushOutbox;
      pull: PullChanges;
      store: SqliteSyncStore;
      isOnline: () => boolean;
      publish: (state: SyncState) => void;
      now?: () => Date;
      intervalMs?: number;
    },
  ) {}

  start(context: SyncContext): void {
    this.stop();
    this.context = context;
    this.refreshCounts();
    void this.syncNow();
    this.timer = setInterval(() => {
      if (this.state.pending > 0) void this.syncNow();
    }, this.deps.intervalMs ?? 60_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.timer = null;
    this.nudgeTimer = null;
    this.context = null;
    this.set(IDLE_SYNC_STATE);
  }

  /** Something was queued or the phone came online: sync soon (several nudges make one run). */
  nudge(delayMs = 300): void {
    this.refreshCounts();
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.nudgeTimer = setTimeout(() => void this.syncNow(), delayMs);
  }

  /** Push then pull once; a call while a run is going schedules one more run after it. */
  syncNow(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.syncNow();
      }
    });
    return this.running;
  }

  refreshCounts(): void {
    const c = this.context;
    if (!c) return;
    this.set({ ...this.state, ...summarize(this.deps.store.open(c.shopId, c.userId)) });
  }

  private async run(): Promise<void> {
    const c = this.context;
    if (!c || !this.deps.isOnline()) {
      this.refreshCounts();
      return;
    }
    this.set({ ...this.state, syncing: true });
    let lastError: string | null = null;
    try {
      const report = await this.deps.push.execute(c.shopId, c.deviceId, c.userId);
      if (report.offline) lastError = 'NETWORK_OFFLINE';
      else await this.deps.pull.execute(c.shopId, c.deviceId);
    } catch (error) {
      lastError = (error as { code?: string }).code ?? (error instanceof Error ? error.message : 'UNKNOWN');
    }
    if (this.context !== c) return; // signed out or switched shop meanwhile
    this.set({
      ...this.state,
      ...summarize(this.deps.store.open(c.shopId, c.userId)),
      syncing: false,
      lastError,
      lastSyncedAt: lastError ? this.state.lastSyncedAt : (this.deps.now?.() ?? new Date()).toISOString(),
    });
  }

  private set(state: SyncState): void {
    this.state = state;
    this.deps.publish(state);
  }
}
