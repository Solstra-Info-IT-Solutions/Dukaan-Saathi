import type {
  CustomerDto,
  ProductDto,
  SyncCursors,
  SyncOperation,
  SyncOperationResultDto,
  SyncPullOutputDto,
  SyncPushInput,
} from '@ds/contracts';

export type { SyncCursors, SyncOperation };
export type OperationResult = SyncOperationResultDto;
export type PullPage = SyncPullOutputDto;
export type PushBatch = SyncPushInput;
export type CachedProduct = ProductDto;
export type CachedCustomer = CustomerDto;

export type OutboxStatus = 'pending' | 'done' | 'quarantined' | 'blocked';

/** One queued operation (OFFLINE_SYNC_DESIGN.md §2 `outbox`). */
export interface OutboxEntry {
  id: string;
  shopId: string;
  userId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  /** What the status screen shows, e.g. the invoice number or the customer's name. */
  label: string | null;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  reviewReasons: string[];
  createdAt: string;
  nextAttemptAt: string;
}

export interface NewOutboxEntry {
  id: string;
  shopId: string;
  userId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  label: string | null;
}

/** Durable local queue + offline copies (implemented with SQLite in the data layer). */
export interface OutboxStore {
  enqueue(entry: NewOutboxEntry, now: string): void;
  /** Pending entries of this user that are due, oldest first. */
  due(shopId: string, userId: string, now: string, limit: number): OutboxEntry[];
  /** Everything not yet done (for the status screen and the sign-out check). */
  open(shopId: string, userId: string): OutboxEntry[];
  /** Entries that need the owner's attention: quarantined, blocked, or applied with review reasons. */
  attention(shopId: string): OutboxEntry[];
  markDone(id: string, reviewReasons: string[], now: string): void;
  markQuarantined(id: string, code: string): void;
  markBlocked(id: string, reason: string): void;
  reschedule(id: string, attempts: number, nextAttemptAt: string, error: string): void;
  /** Sends a quarantined or blocked entry again (owner chose "try again"). */
  requeue(id: string, now: string): void;
  cursors(shopId: string): SyncCursors;
  applyPull(shopId: string, page: PullPage): void;
}

/** sync_push / sync_pull (implemented with Supabase in the data layer). */
export interface SyncRemote {
  push(batch: PushBatch): Promise<OperationResult[]>;
  pull(shopId: string, deviceId: string, cursors: SyncCursors): Promise<PullPage>;
}

export interface SyncSummary {
  /** Waiting to be sent. */
  pending: number;
  /** Not applied and waiting for a person (quarantined or blocked). */
  attention: number;
}

export interface SyncState extends SyncSummary {
  syncing: boolean;
  lastSyncedAt: string | null;
  /** Code of the last failed attempt to reach the server, if the last run failed. */
  lastError: string | null;
}

export const IDLE_SYNC_STATE: SyncState = {
  pending: 0,
  attention: 0,
  syncing: false,
  lastSyncedAt: null,
  lastError: null,
};
