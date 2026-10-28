import type { SqlDatabase } from '@/core/database/SqlDatabase';
import type {
  CachedCustomer,
  CachedProduct,
  NewOutboxEntry,
  OutboxEntry,
  OutboxStore,
  PullPage,
  SyncCursors,
} from '../../../domain/entities/Sync';

interface OutboxRow {
  id: string;
  shop_id: string;
  user_id: string;
  operation: OutboxEntry['operation'];
  payload: string;
  label: string | null;
  status: OutboxEntry['status'];
  attempts: number;
  last_error: string | null;
  review_reasons: string | null;
  created_at: string;
  next_attempt_at: string;
}

const toEntry = (r: OutboxRow): OutboxEntry => ({
  id: r.id,
  shopId: r.shop_id,
  userId: r.user_id,
  operation: r.operation,
  payload: JSON.parse(r.payload) as Record<string, unknown>,
  label: r.label,
  status: r.status,
  attempts: r.attempts,
  lastError: r.last_error,
  reviewReasons: r.review_reasons ? (JSON.parse(r.review_reasons) as string[]) : [],
  createdAt: r.created_at,
  nextAttemptAt: r.next_attempt_at,
});

const searchText = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' ').toLowerCase();

/**
 * Everything the phone keeps for offline work (OFFLINE_SYNC_DESIGN.md §2): the outbox, receipts of bills not yet
 * confirmed, and copies of the catalogue, customers and settings. Writes that belong together share a transaction.
 */
export class SqliteSyncStore implements OutboxStore {
  constructor(private readonly db: SqlDatabase) {}

  // ---- outbox --------------------------------------------------------------------------
  enqueue(entry: NewOutboxEntry, now: string): void {
    this.db.run(
      `insert into outbox (id, shop_id, user_id, operation, payload, label, status, created_at, next_attempt_at)
       values (?, ?, ?, ?, ?, ?, 'pending', ?, ?) on conflict (id) do nothing`,
      [
        entry.id,
        entry.shopId,
        entry.userId,
        entry.operation,
        JSON.stringify(entry.payload),
        entry.label,
        now,
        now,
      ],
    );
  }

  /** A bill saved offline: its receipt and its outbox entry, together or not at all. */
  queueSale(entry: NewOutboxEntry, saleId: string, receipt: unknown, now: string): void {
    this.db.transaction(() => {
      this.enqueue(entry, now);
      this.db.run(
        `insert into local_sales (sale_id, shop_id, op_id, json, created_at) values (?, ?, ?, ?, ?)
         on conflict (sale_id) do nothing`,
        [saleId, entry.shopId, entry.id, JSON.stringify(receipt), now],
      );
    });
  }

  /** A customer added offline: visible in the picker at once, sent with the next sync. */
  queueCustomer(entry: NewOutboxEntry, customer: CachedCustomer, now: string): void {
    this.db.transaction(() => {
      this.enqueue(entry, now);
      this.putCustomer(entry.shopId, customer);
    });
  }

  due(shopId: string, userId: string, now: string, limit: number): OutboxEntry[] {
    return this.db
      .all<OutboxRow>(
        `select * from outbox where shop_id = ? and user_id = ? and status = 'pending' and next_attempt_at <= ?
         order by created_at, rowid limit ?`,
        [shopId, userId, now, limit],
      )
      .map(toEntry);
  }

  open(shopId: string, userId: string): OutboxEntry[] {
    return this.db
      .all<OutboxRow>(
        `select * from outbox where shop_id = ? and user_id = ? and status <> 'done' order by created_at, rowid`,
        [shopId, userId],
      )
      .map(toEntry);
  }

  attention(shopId: string): OutboxEntry[] {
    return this.db
      .all<OutboxRow>(
        `select * from outbox where shop_id = ?
           and (status in ('quarantined', 'blocked') or (status = 'done' and review_reasons is not null))
         order by created_at desc, rowid desc limit 200`,
        [shopId],
      )
      .map(toEntry);
  }

  /** Unsent entries of any user on this phone (sign-out check). */
  unsentCount(userId: string): number {
    return (
      this.db.get<{ n: number }>(`select count(*) as n from outbox where user_id = ? and status <> 'done'`, [
        userId,
      ])?.n ?? 0
    );
  }

  markDone(id: string, reviewReasons: string[], now: string): void {
    this.db.transaction(() => {
      this.db.run(
        `update outbox set status = 'done', done_at = ?, last_error = null, review_reasons = ? where id = ?`,
        [now, reviewReasons.length ? JSON.stringify(reviewReasons) : null, id],
      );
      // The server copy is the receipt from now on.
      this.db.run('delete from local_sales where op_id = ?', [id]);
    });
  }

  markQuarantined(id: string, code: string): void {
    this.db.run(`update outbox set status = 'quarantined', last_error = ? where id = ?`, [code, id]);
  }

  markBlocked(id: string, reason: string): void {
    this.db.run(`update outbox set status = 'blocked', last_error = ? where id = ?`, [reason, id]);
  }

  reschedule(id: string, attempts: number, nextAttemptAt: string, error: string): void {
    this.db.run(`update outbox set attempts = ?, next_attempt_at = ?, last_error = ? where id = ?`, [
      attempts,
      nextAttemptAt,
      error,
      id,
    ]);
  }

  requeue(id: string, now: string): void {
    this.db.run(
      `update outbox set status = 'pending', attempts = 0, next_attempt_at = ?, last_error = null
       where id = ? and status in ('quarantined', 'blocked')`,
      [now, id],
    );
  }

  // ---- receipts of unconfirmed bills ------------------------------------------------------
  localSale(
    saleId: string,
  ): { receipt: unknown; status: OutboxEntry['status']; error: string | null } | null {
    const row = this.db.get<{ json: string; status: OutboxEntry['status']; last_error: string | null }>(
      `select s.json, o.status, o.last_error from local_sales s join outbox o on o.id = s.op_id where s.sale_id = ?`,
      [saleId],
    );
    return row ? { receipt: JSON.parse(row.json), status: row.status, error: row.last_error } : null;
  }

  // ---- catalogue and customers -------------------------------------------------------------
  searchProducts(shopId: string, text: string, limit: number): CachedProduct[] {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    const where = words.map(() => 'search like ?').join(' and ') || '1 = 1';
    return this.db
      .all<{ json: string }>(
        `select json from products_cache where shop_id = ? and active = 1 and ${where}
         order by json_extract(json, '$.name') limit ?`,
        [shopId, ...words.map((w) => `%${w}%`), limit],
      )
      .map((r) => JSON.parse(r.json) as CachedProduct);
  }

  /** Every active item of the shop's copy (voice billing matches against all of them). */
  allProducts(shopId: string): CachedProduct[] {
    return this.db
      .all<{ json: string }>('select json from products_cache where shop_id = ? and active = 1', [shopId])
      .map((r) => JSON.parse(r.json) as CachedProduct);
  }

  productByBarcode(shopId: string, code: string): CachedProduct | null {
    const row = this.db.get<{ json: string }>(
      `select json from products_cache where shop_id = ? and active = 1 and barcodes like ?`,
      [shopId, `%|${code}|%`],
    );
    return row ? (JSON.parse(row.json) as CachedProduct) : null;
  }

  searchCustomers(shopId: string, text: string, limit: number): CachedCustomer[] {
    const q = text.trim().toLowerCase();
    const digits = text.replace(/\D/g, '');
    return this.db
      .all<{ json: string }>(
        `select json from customers_cache where shop_id = ? and archived = 0
           and (search like ? or (? <> '' and search like ?))
         order by json_extract(json, '$.name') limit ?`,
        [shopId, `%${q}%`, digits, `%${digits}%`, limit],
      )
      .map((r) => JSON.parse(r.json) as CachedCustomer);
  }

  putCustomer(shopId: string, c: CachedCustomer): void {
    this.db.run(
      `insert into customers_cache (id, shop_id, search, archived, json) values (?, ?, ?, ?, ?)
       on conflict (id) do update set search = excluded.search, archived = excluded.archived, json = excluded.json`,
      [c.id, shopId, searchText(c.name, c.phone), c.archivedAt ? 1 : 0, JSON.stringify(c)],
    );
  }

  /** Server id for a customer id used on this phone (after a merge by phone number). */
  resolveCustomer(shopId: string, id: string): string {
    return (
      this.db.get<{ customer_id: string }>(
        'select customer_id from customer_aliases where shop_id = ? and alias_id = ?',
        [shopId, id],
      )?.customer_id ?? id
    );
  }

  // ---- small JSON values (settings, catalogue reference, cursors) ---------------------------
  getValue<T>(key: string): T | null {
    const row = this.db.get<{ value: string }>('select value from meta where key = ?', [key]);
    return row ? (JSON.parse(row.value) as T) : null;
  }

  setValue(key: string, value: unknown): void {
    this.db.run(
      'insert into meta (key, value) values (?, ?) on conflict (key) do update set value = excluded.value',
      [key, JSON.stringify(value)],
    );
  }

  cursors(shopId: string): SyncCursors {
    return this.getValue<SyncCursors>(`cursors:${shopId}`) ?? {};
  }

  applyPull(shopId: string, page: PullPage): void {
    this.db.transaction(() => {
      for (const p of page.products.rows) {
        this.db.run(
          `insert into products_cache (id, shop_id, search, barcodes, active, json) values (?, ?, ?, ?, ?, ?)
           on conflict (id) do update set search = excluded.search, barcodes = excluded.barcodes,
             active = excluded.active, json = excluded.json`,
          [
            p.id,
            shopId,
            searchText(p.name, p.nameHi, ...p.aliases),
            `|${p.barcodes.join('|')}|`,
            p.isActive && !p.archivedAt ? 1 : 0,
            JSON.stringify(p),
          ],
        );
      }
      for (const c of page.customers.rows) this.putCustomer(shopId, c);
      for (const a of page.customerAliases.rows) {
        this.db.run(
          `insert into customer_aliases (shop_id, alias_id, customer_id) values (?, ?, ?)
           on conflict do update set customer_id = excluded.customer_id`,
          [shopId, a.aliasId, a.customerId],
        );
        // The merged-away local copy disappears from the picker.
        this.db.run('delete from customers_cache where shop_id = ? and id = ?', [shopId, a.aliasId]);
      }
      this.setValue(`settings:${shopId}`, page.settings);
      const previous = this.cursors(shopId);
      this.setValue(`cursors:${shopId}`, {
        products: page.products.cursor ?? previous.products ?? null,
        categories: page.categories.cursor ?? previous.categories ?? null,
        customers: page.customers.cursor ?? previous.customers ?? null,
        aliases: page.customerAliases.cursor ?? previous.aliases ?? null,
      } satisfies SyncCursors);
      this.setValue(`pulledAt:${shopId}`, page.serverTime);
    });
  }
}
