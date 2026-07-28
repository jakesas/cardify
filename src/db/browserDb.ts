import { openDB, type IDBPDatabase } from 'idb';

type Row = Record<string, any>;

interface Condition {
  col: string;
  op: string;
  param: any;
}

function countQuestionMarks(sql: string): number {
  return (sql.match(/\?/g) || []).length;
}

function parseWhere(sql: string, params: any[]): Condition[] {
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
  if (!whereMatch) return [];
  const clauses = whereMatch[1].split(/\s+AND\s+/i);
  const conditions: Condition[] = [];
  let paramIdx = 0;
  for (const clause of clauses) {
    const trimmed = clause.trim();
    const eqMatch = trimmed.match(/^(\w+)\s*=\s*\?$/);
    if (eqMatch) { conditions.push({ col: eqMatch[1], op: '=', param: params[paramIdx++] }); continue; }
    const leMatch = trimmed.match(/^(\w+)\s*<=\s*\?$/);
    if (leMatch) { conditions.push({ col: leMatch[1], op: '<=', param: params[paramIdx++] }); continue; }
    const geMatch = trimmed.match(/^(\w+)\s*>=\s*\?$/);
    if (geMatch) { conditions.push({ col: geMatch[1], op: '>=', param: params[paramIdx++] }); continue; }
    paramIdx++;
  }
  return conditions;
}

function parseOrderBy(sql: string): { col: string; dir: 'asc' | 'desc' } | null {
  const match = sql.match(/ORDER\s+BY\s+(\w+)\s*(ASC|DESC)?/i);
  if (!match) return null;
  return { col: match[1], dir: (match[2]?.toLowerCase() as 'asc' | 'desc') || 'asc' };
}

function parseLimit(sql: string): number | null {
  const match = sql.match(/LIMIT\s+(\d+)/i);
  return match ? parseInt(match[1]) : null;
}

function isReturning(sql: string): boolean {
  return /RETURNING\s+/i.test(sql);
}

function splitSqlSections(sql: string): { beforeWhere: string; whereClause: string } {
  const whereIdx = sql.search(/\bWHERE\b/i);
  if (whereIdx === -1) return { beforeWhere: sql, whereClause: '' };
  return {
    beforeWhere: sql.slice(0, whereIdx),
    whereClause: sql.slice(whereIdx),
  };
}

export class BrowserDb {
  private dbPromise: Promise<IDBPDatabase>;

  constructor(dbName?: string) {
    this.dbPromise = openDB(dbName || 'ccna-srs', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('decks')) {
          db.createObjectStore('decks', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('cards')) {
          const store = db.createObjectStore('cards', { keyPath: 'id', autoIncrement: true });
          store.createIndex('deck_id', 'deck_id');
          store.createIndex('due_date', 'due_date');
        }
        if (!db.objectStoreNames.contains('reviews')) {
          const store = db.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true });
          store.createIndex('card_id', 'card_id');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }

  async select<T = Row[]>(sql: string, params: any[] = []): Promise<T> {
    const db = await this.dbPromise;
    const table = tableName(sql);
    const isCount = /COUNT\s*\(\*\)/i.test(sql);
    const isInsertReturning = /^INSERT\s+INTO/i.test(sql) && isReturning(sql);
    const isUpdateReturning = /^UPDATE/i.test(sql) && isReturning(sql);

    if (isInsertReturning) {
      const result = await this.executeInsert(sql, params, db);
      const saved = await db.get(table, result.lastInsertId!);
      return [saved] as T;
    }

    if (isUpdateReturning) {
      await this.executeUpdate(sql, params, db);
      const { beforeWhere } = splitSqlSections(sql);
      const setQmCount = countQuestionMarks(beforeWhere);
      const whereParams = params.slice(setQmCount);
      const whereConditions = parseWhere(sql, whereParams);
      const all = await db.getAll(table);
      const matched = all.filter((row: any) =>
        whereConditions.every((c) => row[c.col] == c.param)
      );
      return matched as T;
    }

    if (/^SELECT\s+value\s+FROM\s+settings/i.test(sql)) {
      const key = params[0];
      const row = await db.get('settings', key);
      return (row ? [row] : []) as T;
    }

    if (table === 'settings') {
      const all = await db.getAll('settings');
      return all as T;
    }

    const conditions = parseWhere(sql, params);
    let rows = await db.getAll(table);

    for (const cond of conditions) {
      rows = rows.filter((row: any) => {
        const val = row[cond.col];
        switch (cond.op) {
          case '=': return val == cond.param;
          case '<=': return val <= cond.param;
          case '>=': return val >= cond.param;
          default: return true;
        }
      });
    }

    if (isCount) {
      return [{ count: rows.length }] as T;
    }

    const orderBy = parseOrderBy(sql);
    if (orderBy) {
      rows.sort((a: any, b: any) => {
        const va = a[orderBy.col];
        const vb = b[orderBy.col];
        if (va == null) return 1;
        if (vb == null) return -1;
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return orderBy.dir === 'desc' ? -cmp : cmp;
      });
    }

    const limit = parseLimit(sql);
    if (limit && limit > 0) {
      rows = rows.slice(0, limit);
    }

    return rows as T;
  }

  async execute(sql: string, params: any[] = []): Promise<{ lastInsertId: number | null; rowsAffected: number }> {
    const db = await this.dbPromise;

    if (/^DELETE\s+FROM/i.test(sql)) {
      return this.executeDelete(sql, params, db);
    }
    if (/^INSERT\s+INTO/i.test(sql)) {
      if (isReturning(sql)) {
        return this.executeInsert(sql, params, db);
      }
      return this.executeInsert(sql, params, db);
    }
    if (/^UPDATE/i.test(sql)) {
      return this.executeUpdate(sql, params, db);
    }

    return { lastInsertId: null, rowsAffected: 0 };
  }

  private async executeInsert(
    sql: string, params: any[], db: IDBPDatabase
  ): Promise<{ lastInsertId: number | null; rowsAffected: number }> {
    const isUpsert = /ON\s+CONFLICT/i.test(sql);

    const colMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
    const valMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
    if (!colMatch || !valMatch) return { lastInsertId: null, rowsAffected: 0 };

    const cols = colMatch[1].split(',').map((c: string) => c.trim());
    const rawValues = valMatch[1].split(',').map((v: string) => v.trim());

    // Handle ON CONFLICT for settings table
    if (isUpsert && tableName(sql) === 'settings') {
      const keyIdx = cols.indexOf('key');
      const valIdx = cols.indexOf('value');
      if (keyIdx !== -1 && valIdx !== -1) {
        const key = params[keyIdx];
        const value = params[valIdx];
        await db.put('settings', { key, value });
        return { lastInsertId: null, rowsAffected: 1 };
      }
    }

    const row: Record<string, any> = {};
    let paramIdx = 0;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const raw = rawValues[i];
      if (raw === "datetime('now')") {
        row[col] = new Date().toISOString();
      } else if (raw === '?') {
        row[col] = params[paramIdx++];
      }
    }

    if (isUpsert) {
      if (tableName(sql) === 'settings' && row.key) {
        await db.put('settings', { key: row.key, value: row.value });
        return { lastInsertId: null, rowsAffected: 1 };
      }
      const id = await db.put(tableName(sql), row);
      return { lastInsertId: id as number, rowsAffected: 1 };
    }

    const id = await db.add(tableName(sql), row);
    return { lastInsertId: id as number, rowsAffected: 1 };
  }

  private async executeUpdate(
    sql: string, params: any[], db: IDBPDatabase
  ): Promise<{ lastInsertId: number | null; rowsAffected: number }> {
    const { beforeWhere } = splitSqlSections(sql);
    const setMatch = sql.match(/SET\s+(.+?)(?:\s+WHERE|\s+RETURNING)/i);
    if (!setMatch) return { lastInsertId: null, rowsAffected: 0 };

    const setClauses = setMatch[1].split(',').map((s: string) => s.trim());

    // Count how many ? are in the SET clause (not counting datetime('now') literals)
    const beforeWhereQm = countQuestionMarks(beforeWhere);
    const setParams = params.slice(0, beforeWhereQm);
    const whereParams = params.slice(beforeWhereQm);

    const conditions = parseWhere(sql, whereParams);

    let paramIdx = 0;
    const updates: Record<string, any> = {};
    for (const clause of setClauses) {
      const eqMatch = clause.match(/^(\w+)\s*=\s*\?$/);
      if (eqMatch) {
        updates[eqMatch[1]] = setParams[paramIdx++];
        continue;
      }
      if (/=\s*datetime\('now'\)/i.test(clause)) {
        const colMatch = clause.match(/^(\w+)\s*=/i);
        if (colMatch) updates[colMatch[1]] = new Date().toISOString();
      }
    }

    const all = await db.getAll(tableName(sql));
    let updatedCount = 0;
    for (const row of all) {
      let matches = true;
      for (const cond of conditions) {
        if (row[cond.col] == cond.param) {
          // condition matches, continue checking
        } else {
          matches = false;
          break;
        }
      }
      if (matches) {
        await db.put(tableName(sql), { ...row, ...updates });
        updatedCount++;
      }
    }
    return { lastInsertId: null, rowsAffected: updatedCount };
  }

  private async executeDelete(
    sql: string, params: any[], db: IDBPDatabase
  ): Promise<{ lastInsertId: number | null; rowsAffected: number }> {
    const conditions = parseWhere(sql, params);
    const all = await db.getAll(tableName(sql));
    let deletedCount = 0;
    for (const row of all) {
      let matches = conditions.length === 0;
      for (const cond of conditions) {
        if (row[cond.col] == cond.param) matches = true;
        else { matches = false; break; }
      }
      if (matches) {
        await db.delete(tableName(sql), row.id);
        deletedCount++;
      }
    }
    return { lastInsertId: null, rowsAffected: deletedCount };
  }
}

function tableName(sql: string): string {
  const match = sql.match(/(?:FROM|INTO|UPDATE)\s+(\w+)/i);
  return match ? match[1].toLowerCase() : '';
}
