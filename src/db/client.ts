import { BrowserDb } from './browserDb';
import { isTauri } from '@tauri-apps/api/core';

type DbExecutor = {
  select<T = any[]>(sql: string, params?: any[]): Promise<T>;
  execute(sql: string, params?: any[]): Promise<{ lastInsertId: number | null; rowsAffected: number }>;
};

let db: DbExecutor | null = null;
let currentUserId: string | null = null;

/** Call when the auth user changes. Resets the DB connection so the next
 *  getDb() call opens a database scoped to the new user. */
export function setDbUser(userId: string | null): void {
  if (userId === currentUserId) return;
  db = null;
  currentUserId = userId;
}

export async function getDb(): Promise<DbExecutor> {
  if (db) return db;

  const suffix = currentUserId ? `-${currentUserId}` : '';
  const dbName = `ccna-srs${suffix}`;

  if (isTauri()) {
    // The desktop (SQLite) connection must use the exact base database name
    // (`sqlite:ccna-srs.db`) that the Rust migrations are registered under in
    // main.rs. A per-user suffix here would create a table-less DB, since the
    // SQL plugin only applies migrations to an exact-matching URL.
    const desktopDbName = 'ccna-srs';
    try {
      const { default: TauriDatabase } = await import('@tauri-apps/plugin-sql');
      const tauriDb = await TauriDatabase.load(`sqlite:${desktopDbName}.db`);
      db = tauriDb as unknown as DbExecutor;
      console.log(`[DB] Connected to SQLite (${desktopDbName}.db).`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.error(`[DB] SQLite failed, falling back to IndexedDB. Error:`, msg);
      (window as any).__DB_ERROR__ = msg;
      db = new BrowserDb(dbName);
    }
  } else {
    console.log(`[DB] Using BrowserDb (${dbName}).`);
    db = new BrowserDb(dbName);
  }

  return db;
}
