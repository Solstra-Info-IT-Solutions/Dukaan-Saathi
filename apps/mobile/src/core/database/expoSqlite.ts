import { openDatabaseSync } from 'expo-sqlite';
import { migrate, type SqlDatabase, type SqlValue } from './SqlDatabase';

/** Opens (and migrates) the app's SQLite file. Called once by the composition root. */
export function openAppDatabase(name = 'dukaan-saathi.db'): SqlDatabase {
  const native = openDatabaseSync(name);
  native.execSync('pragma journal_mode = wal; pragma foreign_keys = on;');
  const db: SqlDatabase = {
    exec: (sql) => native.execSync(sql),
    run: (sql, params = []) => {
      native.runSync(sql, params as SqlValue[]);
    },
    all: <T>(sql: string, params: readonly SqlValue[] = []) =>
      native.getAllSync<T>(sql, params as SqlValue[]),
    get: <T>(sql: string, params: readonly SqlValue[] = []) =>
      native.getFirstSync<T>(sql, params as SqlValue[]),
    transaction: <T>(work: () => T) => {
      let result!: T;
      native.withTransactionSync(() => {
        result = work();
      });
      return result;
    },
  };
  migrate(db);
  return db;
}
