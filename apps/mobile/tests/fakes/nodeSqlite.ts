/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite';
import { migrate, type SqlDatabase, type SqlValue } from '@/core/database/SqlDatabase';

/** The app's SQLite schema in memory (Node's built-in SQLite), so tests run the real SQL. */
export function memoryDatabase(): SqlDatabase {
  const native = new DatabaseSync(':memory:');
  native.exec('pragma foreign_keys = on;');
  let depth = 0;
  const db: SqlDatabase = {
    exec: (sql) => native.exec(sql),
    run: (sql, params = []) => {
      native.prepare(sql).run(...(params as SqlValue[]));
    },
    all: <T>(sql: string, params: readonly SqlValue[] = []) =>
      native.prepare(sql).all(...(params as SqlValue[])) as T[],
    get: <T>(sql: string, params: readonly SqlValue[] = []) =>
      (native.prepare(sql).get(...(params as SqlValue[])) as T | undefined) ?? null,
    transaction: <T>(work: () => T) => {
      if (depth > 0) return work();
      depth += 1;
      native.exec('begin');
      try {
        const result = work();
        native.exec('commit');
        return result;
      } catch (error) {
        native.exec('rollback');
        throw error;
      } finally {
        depth -= 1;
      }
    },
  };
  migrate(db);
  return db;
}
