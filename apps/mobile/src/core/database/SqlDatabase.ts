/**
 * Local SQLite database (OFFLINE_SYNC_DESIGN.md §2). A small synchronous interface so the same SQL runs on the
 * phone (expo-sqlite) and in Jest (node:sqlite, tests/fakes/nodeSqlite.ts).
 */
export type SqlValue = string | number | null;

export interface SqlDatabase {
  exec(sql: string): void;
  run(sql: string, params?: readonly SqlValue[]): void;
  all<T>(sql: string, params?: readonly SqlValue[]): T[];
  get<T>(sql: string, params?: readonly SqlValue[]): T | null;
  /** Runs `work` in one transaction: everything or nothing. */
  transaction<T>(work: () => T): T;
}

/** Schema versions in order; `PRAGMA user_version` records how many have run. Never edit a shipped entry. */
export const MIGRATIONS: readonly string[] = [
  `
  create table meta (key text primary key, value text not null);

  -- Operations waiting to be sent with sync_push, in creation order. One row per client operation id.
  create table outbox (
    id text primary key,
    shop_id text not null,
    user_id text not null,
    operation text not null,
    payload text not null,
    label text,
    status text not null check (status in ('pending', 'done', 'quarantined', 'blocked')),
    attempts integer not null default 0,
    last_error text,
    review_reasons text,
    created_at text not null,
    next_attempt_at text not null,
    done_at text
  );
  create index outbox_queue on outbox (shop_id, user_id, status, created_at);

  -- Bills saved on this phone that the server has not confirmed yet (receipt shown from here).
  create table local_sales (
    sale_id text primary key,
    shop_id text not null,
    op_id text not null references outbox (id),
    json text not null,
    created_at text not null
  );

  create table products_cache (
    id text primary key,
    shop_id text not null,
    search text not null,
    barcodes text not null,
    active integer not null,
    json text not null
  );
  create index products_cache_shop on products_cache (shop_id);

  create table customers_cache (
    id text primary key,
    shop_id text not null,
    search text not null,
    archived integer not null,
    json text not null
  );
  create index customers_cache_shop on customers_cache (shop_id);

  create table customer_aliases (
    shop_id text not null,
    alias_id text not null,
    customer_id text not null,
    primary key (shop_id, alias_id)
  );
  `,
];

/** Brings the schema up to date; each version runs in its own transaction. */
export function migrate(db: SqlDatabase): number {
  const current = db.get<{ user_version: number }>('pragma user_version')?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v += 1) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.exec(`pragma user_version = ${v + 1}`);
    });
  }
  return MIGRATIONS.length;
}
