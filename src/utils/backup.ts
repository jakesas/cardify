import { getDb } from '../db/client';
import {
  listDecks,
  getAllCards,
  getAllReviews,
  listAiSessions,
  getSetting,
  setSetting,
} from '../db/queries';
import { isTauri } from '@tauri-apps/api/core';

export interface BackupSnapshot {
  version: number;
  createdAt: string;
  reason: string;
  decks: any[];
  cards: any[];
  reviews: any[];
  settings: Array<{ key: string; value: string }>;
  aiSessions: any[];
}

export interface BackupMeta {
  ts: string;
  reason: string;
  decks: number;
  cards: number;
  reviews: number;
}

/**
 * Create a full snapshot of all user data tables.
 * Works in both Tauri (SQLite) and browser (IndexedDB) modes.
 */
export async function createBackupSnapshot(reason = 'manual'): Promise<BackupSnapshot> {
  const [decks, cards, reviews, aiSessions, settings] = await Promise.all([
    listDecks(),
    getAllCards(),
    getAllReviews(),
    listAiSessions(),
    getDb().then((db) =>
      db.select<{ key: string; value: string }[]>('SELECT key, value FROM settings')
    ),
  ]);

  // Filter out backup keys from settings to avoid recursion on restore
  const filteredSettings = (settings || []).filter(
    (s) => !s.key.startsWith('backup:')
  );

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    reason,
    decks: decks || [],
    cards: cards || [],
    reviews: reviews || [],
    settings: filteredSettings,
    aiSessions: aiSessions || [],
  };
}

/**
 * Save a snapshot in the settings table (works in both engines).
 * Keeps the latest snapshot and a rolling history (max 20).
 */
export async function saveBackupInDb(snapshot: BackupSnapshot): Promise<void> {
  const json = JSON.stringify(snapshot);

  // Save latest
  await setSetting('backup:latest', json);

  // Update history
  const histRaw = await getSetting('backup:history');
  const history: BackupMeta[] = histRaw ? JSON.parse(histRaw) : [];
  history.push({
    ts: snapshot.createdAt,
    reason: snapshot.reason,
    decks: snapshot.decks.length,
    cards: snapshot.cards.length,
    reviews: snapshot.reviews.length,
  });
  // Keep last 20
  if (history.length > 20) history.splice(0, history.length - 20);
  await setSetting('backup:history', JSON.stringify(history));
}

/**
 * Get the latest backup snapshot from settings.
 */
export async function getLatestBackup(): Promise<BackupSnapshot | null> {
  const raw = await getSetting('backup:latest');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * List all backup metadata from history.
 */
export async function listBackups(): Promise<BackupMeta[]> {
  const raw = await getSetting('backup:history');
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Try to write the snapshot to a JSON file in the app data directory.
 * Only works in Tauri mode; silently falls back if fs plugin or scope denies.
 */
export async function writeBackupToFile(snapshot: BackupSnapshot): Promise<string | null> {
  if (!isTauri()) return null;

  try {
    const { appDataDir } = await import('@tauri-apps/api/path');
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const dir = await appDataDir();
    const backupsDir = `${dir}backups`;
    await mkdir(backupsDir, { recursive: true });

    const ts = snapshot.createdAt.replace(/[:.]/g, '-');
    const filename = `ccna-srs-backup-${ts}.json`;
    // Use forward slash; tauri-plugin-fs on Windows handles it
    const filePath = `${backupsDir}/${filename}`;

    await writeTextFile(filePath, JSON.stringify(snapshot, null, 2));
    console.log(`[Backup] Written to file: ${filePath}`);
    return filePath;
  } catch (e) {
    console.warn('[Backup] File export failed (scope or fs error):', e);
    return null;
  }
}

/**
 * Create a backup and persist it (in-DB + optional file).
 */
export async function createBackup(reason = 'manual'): Promise<BackupSnapshot> {
  const snapshot = await createBackupSnapshot(reason);
  await saveBackupInDb(snapshot);
  await writeBackupToFile(snapshot); // best-effort file export
  return snapshot;
}

/**
 * Restore all user data from a snapshot.
 * Re-inserts decks (mapping old IDs → new), then cards with SM-2 state,
 * then reviews (remapping card IDs).
 */
export async function restoreFromSnapshot(snapshot: BackupSnapshot): Promise<{
  decks: number;
  cards: number;
  reviews: number;
}> {
  const db = await getDb();

  // 1) Wipe in correct FK order
  await db.execute('DELETE FROM reviews');
  await db.execute('DELETE FROM cards');
  await db.execute('DELETE FROM decks');

  // 2) Re-insert decks, build oldId → newId map
  const deckIdMap = new Map<number, number>();
  for (const d of snapshot.decks) {
    const r = await db.execute(
      `INSERT INTO decks (name, description, created_at, study_material)
       VALUES (?, ?, ?, ?)`,
      [d.name, d.description ?? null, d.created_at ?? new Date().toISOString(), d.study_material ?? null]
    );
    const newId = Number(r.lastInsertId);
    deckIdMap.set(Number(d.id), newId);
  }

  // 3) Re-insert cards with full SM-2 state, mapping deck_id
  const cardIdMap = new Map<number, number>();
  for (const c of snapshot.cards) {
    const newDeckId = deckIdMap.get(Number(c.deck_id));
    if (!newDeckId) continue; // skip orphaned cards
    const r = await db.execute(
      `INSERT INTO cards (
         deck_id, card_type, front, back, tag, image_path, code_snippet, topology,
         ease_factor, interval_days, reps, due_date, last_reviewed_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        newDeckId,
        c.card_type ?? 'basic',
        c.front ?? '',
        c.back ?? '',
        c.tag ?? null,
        c.image_path ?? null,
        c.code_snippet ? JSON.stringify(c.code_snippet) : null,
        c.topology ? JSON.stringify(c.topology) : null,
        c.ease_factor ?? 2.5,
        c.interval_days ?? 0,
        c.reps ?? 0,
        c.due_date ?? new Date().toISOString().split('T')[0],
        c.last_reviewed_at ?? null,
      ]
    );
    cardIdMap.set(Number(c.id), Number(r.lastInsertId));
  }

  // 4) Re-insert reviews with mapped card_id
  for (const rv of snapshot.reviews) {
    const newCardId = cardIdMap.get(Number(rv.card_id));
    if (!newCardId) continue;
    await db.execute(
      `INSERT INTO reviews (card_id, rating, reviewed_at, prev_interval, new_interval, prev_ease, new_ease)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        newCardId,
        rv.rating,
        rv.reviewed_at,
        rv.prev_interval,
        rv.new_interval,
        rv.prev_ease,
        rv.new_ease,
      ]
    );
  }

  // 5) Restore ai_sessions (deck_id set to NULL — historical link lost, but content preserved)
  for (const s of snapshot.aiSessions) {
    await getDb().then((db) =>
      db.execute(
        `INSERT INTO ai_sessions (session_type, input_text, output_text, cards_json, deck_id, deck_name, card_count, created_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
        [
          s.session_type,
          s.input_text,
          s.output_text ?? null,
          s.cards_json ?? null,
          s.deck_name ?? null,
          s.card_count ?? 0,
          s.created_at,
        ]
      )
    );
  }

  // 5) Restore settings (excluding backup keys to avoid loops)
  for (const s of snapshot.settings) {
    if (s.key.startsWith('backup:')) continue;
    await getDb().then((db) =>
      db.execute(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [s.key, s.value]
      )
    );
  }

  return {
    decks: snapshot.decks.length,
    cards: snapshot.cards.length,
    reviews: snapshot.reviews.length,
  };
}

/**
 * Restore the most recent backup (from in-DB settings).
 * Returns counts of restored items.
 */
export async function restoreLatestBackup(): Promise<{
  decks: number;
  cards: number;
  reviews: number;
} | null> {
  const latest = await getLatestBackup();
  if (!latest) return null;
  return restoreFromSnapshot(latest);
}

/**
 * Auto-backup: runs on app start if no backup today.
 * Also runs before schema migrations and before destructive reset.
 */
export async function maybeAutoBackup(reason = 'auto-startup'): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const lastAuto = await getSetting('backup:last-auto-date');
  if (lastAuto === today) return false; // already backed up today

  const snapshot = await createBackup(reason);
  // Only count as "auto" backup if there was data to protect
  if (snapshot.decks.length === 0 && snapshot.cards.length === 0) {
    return false;
  }
  await setSetting('backup:last-auto-date', today);
  return true;
}

/**
 * Force a backup before a destructive operation (migration or reset).
 * Does NOT throttle — always creates a snapshot if there's any user data.
 */
export async function backupBeforeDestructive(reason: string): Promise<boolean> {
  const snapshot = await createBackupSnapshot(reason);
  if (snapshot.decks.length === 0 && snapshot.cards.length === 0) {
    return false;
  }
  await saveBackupInDb(snapshot);
  await writeBackupToFile(snapshot);
  return true;
}