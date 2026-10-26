import type { OperationResult, OutboxEntry, OutboxStore, SyncRemote, SyncSummary } from '../entities/Sync';

/** Retry delays after failed attempts (OFFLINE_SYNC_DESIGN.md §5): 5 s, 15 s, 1 min, 5 min, then every 15 min. */
export const BACKOFF_SECONDS = [5, 15, 60, 300, 900] as const;

/** Delay before attempt `attempts + 1`, with up to 20 % jitter so phones do not retry in step. */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const base = BACKOFF_SECONDS[Math.min(Math.max(attempts, 1), BACKOFF_SECONDS.length) - 1]! * 1000;
  return Math.round(base * (1 + 0.2 * random()));
}

/** The customer a queued operation depends on (a bill on udhaar or a repayment), if any. */
export function customerOf(entry: Pick<OutboxEntry, 'operation' | 'payload'>): string | null {
  if (entry.operation === 'create_customer') return null;
  const id = entry.payload.customerId;
  return typeof id === 'string' ? id : null;
}

export interface PushReport {
  sent: number;
  applied: number;
  needsReview: number;
  quarantined: number;
  retried: number;
  /** True when the phone could not reach the server; nothing was marked. */
  offline: boolean;
}

/**
 * Sends due operations in queue order, at most `batchSize` per call, until nothing is due.
 * Never drops an operation: results are recorded per operation; transient failures are rescheduled with backoff;
 * a bill or repayment for a customer whose creation was quarantined is held as "blocked".
 */
export class PushOutbox {
  constructor(
    private readonly store: OutboxStore,
    private readonly remote: SyncRemote,
    private readonly clock: { now(): Date },
    private readonly random: () => number = Math.random,
    private readonly batchSize = 50,
  ) {}

  async execute(shopId: string, deviceId: string, userId: string): Promise<PushReport> {
    const report: PushReport = {
      sent: 0,
      applied: 0,
      needsReview: 0,
      quarantined: 0,
      retried: 0,
      offline: false,
    };
    for (;;) {
      const now = this.clock.now().toISOString();
      const failedCustomers = new Set(
        this.store
          .attention(shopId)
          .filter((e) => e.operation === 'create_customer' && e.status !== 'done')
          .map((e) => e.id),
      );
      const due = this.store.due(shopId, userId, now, this.batchSize);
      const batch: OutboxEntry[] = [];
      for (const entry of due) {
        const customer = customerOf(entry);
        if (customer && failedCustomers.has(customer)) {
          this.store.markBlocked(entry.id, 'CUSTOMER_NOT_SAVED');
        } else {
          batch.push(entry);
        }
      }
      if (batch.length === 0) return report;

      let results: OperationResult[];
      try {
        results = await this.remote.push({
          shopId,
          deviceId,
          operations: batch.map((e) => ({
            clientOperationId: e.id,
            operation: e.operation,
            payload: e.payload,
          })),
        });
      } catch (error) {
        // Unreachable server or a failed request: try the whole batch again later. Nothing is lost.
        const code =
          (error as { code?: string }).code ?? (error instanceof Error ? error.message : 'UNKNOWN');
        for (const entry of batch) {
          this.store.reschedule(entry.id, entry.attempts + 1, this.later(entry.attempts + 1), code);
        }
        report.offline = true;
        return report;
      }

      const byId = new Map(results.map((r) => [r.clientOperationId, r]));
      for (const entry of batch) {
        report.sent += 1;
        const r = byId.get(entry.id);
        if (!r || r.status === 'retry') {
          report.retried += 1;
          this.store.reschedule(
            entry.id,
            entry.attempts + 1,
            this.later(entry.attempts + 1),
            r?.code ?? 'NO_RESULT',
          );
        } else if (r.status === 'quarantined') {
          report.quarantined += 1;
          this.store.markQuarantined(entry.id, r.code ?? 'DS_INTERNAL');
          if (entry.operation === 'create_customer') failedCustomers.add(entry.id);
        } else {
          const reasons = Array.isArray(r.result?.reviewReasons) ? (r.result.reviewReasons as string[]) : [];
          if (r.status === 'needs_review') report.needsReview += 1;
          else report.applied += 1;
          this.store.markDone(entry.id, reasons, now);
        }
      }
    }
  }

  private later(attempts: number): string {
    return new Date(this.clock.now().getTime() + backoffMs(attempts, this.random)).toISOString();
  }
}

/** Refreshes the phone's copies (catalogue, customers, aliases, settings) until every list is complete. */
export class PullChanges {
  constructor(
    private readonly store: OutboxStore,
    private readonly remote: SyncRemote,
    private readonly maxPages = 20,
  ) {}

  async execute(shopId: string, deviceId: string): Promise<{ pages: number }> {
    for (let pages = 1; pages <= this.maxPages; pages += 1) {
      const page = await this.remote.pull(shopId, deviceId, this.store.cursors(shopId));
      this.store.applyPull(shopId, page);
      if (!page.products.more && !page.categories.more && !page.customers.more) return { pages };
    }
    return { pages: this.maxPages };
  }
}

export function summarize(open: readonly OutboxEntry[]): SyncSummary {
  return {
    pending: open.filter((e) => e.status === 'pending').length,
    attention: open.filter((e) => e.status === 'quarantined' || e.status === 'blocked').length,
  };
}

/** Starts a sync run from the UI ("Sync now", "Try again"); implemented by the SyncService. */
export interface SyncTrigger {
  syncNow(): Promise<void>;
  nudge(): void;
}

export interface SyncQueue {
  /** Waiting to be sent, oldest first. */
  waiting: OutboxEntry[];
  /** Not applied (quarantined, blocked) or applied with review flags, newest first. */
  attention: OutboxEntry[];
}

export class GetSyncQueue {
  constructor(private readonly store: OutboxStore) {}
  execute(shopId: string, userId: string): SyncQueue {
    return {
      waiting: this.store.open(shopId, userId).filter((e) => e.status === 'pending'),
      attention: this.store.attention(shopId),
    };
  }
}

/** Sends a quarantined or blocked operation again (e.g. after the owner re-activated the member). */
export class RetryOperation {
  constructor(
    private readonly store: OutboxStore,
    private readonly trigger: SyncTrigger,
    private readonly clock: { now(): Date },
  ) {}
  execute(id: string): void {
    this.store.requeue(id, this.clock.now().toISOString());
    this.trigger.nudge();
  }
}
