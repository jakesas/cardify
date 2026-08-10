// Backup & restore, Firestore-backed.
//
// The database is now Firestore, so a backup is a JSON snapshot of the user's
// collections stored in the `backup:*` settings documents. Restore wipes the
// Firestore collections (via queries.clearAllUserData) and re-inserts every
// entity through the queries helpers (insertDeck/createCard/addReviewHistory/
// saveAiSession/setSetting), remapping old ids to the new Firestore doc ids.
//
// Snapshots produced before the Firebase rewrite stored legacy snake_case rows
// (deck_id, ease_factor, ...); restore still reads those fields so old backups
// remain restorable.

import {
  listDecks,
  getAllCards,
  getAllReviews,
  listAiSessions,
  getAllSettings,
  getSetting,
  setSetting,
  insertDeck,
  createCard,
  updateCard,
  addReviewHistory,
  saveAiSession,
  clearAllUserData,
} from '../db/queries';
import { NetworkTopology } from '../types';

export interface BackupSnapshot {
  version: number;
  createdAt: string;
  reason: string;
  decks: RestorableDeck[];
  cards: RestorableCard[];
  reviews: RestorableReview[];
  settings: Array<{ key: string; value: string }>;
  aiSessions: RestorableAiSession[];
}

export interface BackupMeta {
  ts: string;
  reason: string;
  decks: number;
  cards: number;
  reviews: number;
}

// Entity shapes that both current (camelCase) and legacy (snake_case)
// snapshots satisfy, so restore can read either.
interface RestorableDeck {
  id?: string | number;
  name?: string;
  description?: string | null;
  studyMaterial?: string;
  study_material?: string;
  createdAt?: string;
  created_at?: string;
}

interface RestorableCard {
  id?: string | number;
  deckId?: string | number;
  deck_id?: string | number;
  cardType?: string;
  card_type?: string;
  front?: string;
  back?: string;
  tag?: string;
  imagePath?: string;
  image_path?: string;
  codeSnippet?: string | { code: string; language: string };
  code_snippet?: string;
  topology?: unknown;
  bookmarked?: boolean | number;
  reps?: number;
  interval?: number;
  interval_days?: number;
  easeFactor?: number;
  ease_factor?: number;
  dueDate?: string;
  due_date?: string;
  lastReviewedAt?: string;
  last_reviewed_at?: string;
}

interface RestorableReview {
  id?: string | number;
  cardId?: string | number;
  card_id?: string | number;
  rating?: number;
  timestamp?: string;
  reviewed_at?: string;
  previousInterval?: number;
  prev_interval?: number;
  nextInterval?: number;
  new_interval?: number;
  previousEaseFactor?: number;
  prev_ease?: number;
  nextEaseFactor?: number;
  new_ease?: number;
}

interface RestorableAiSession {
  id?: string | number;
  sessionType?: string;
  session_type?: string;
  inputText?: string;
  input_text?: string;
  outputText?: string | null;
  output_text?: string | null;
  cardsJson?: string | null;
  cards_json?: string | null;
  deckName?: string | null;
  deck_name?: string | null;
  cardCount?: number;
  card_count?: number;
  createdAt?: string;
  created_at?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayStr(): string {
  return nowIso().split('T')[0];
}

/** First defined (non-null) value among legacy/current field spellings. */
function first<T>(...values: Array<T | null | undefined>): T | undefined {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return undefined;
}

/** Legacy rows stored code_snippet/topology as JSON strings; current store objects. */
function coerceJson(value: unknown): unknown {
  if (typeof value === 'string' && value !== '') {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value;
}

/**
 * Create a full snapshot of all user data (Firestore collections).
 */
export async function createBackupSnapshot(reason = 'manual'): Promise<BackupSnapshot> {
  const [decks, cards, reviews, aiSessions, settings] = await Promise.all([
    listDecks(),
    getAllCards(),
    getAllReviews(),
    listAiSessions(),
    getAllSettings(),
  ]);

  // Filter out backup keys from settings to avoid recursion on restore
  const filteredSettings = settings.filter((s) => !s.key.startsWith('backup:'));

  return {
    version: 1,
    createdAt: nowIso(),
    reason,
    decks: decks ?? [],
    cards: cards ?? [],
    reviews: reviews ?? [],
    settings: filteredSettings,
    aiSessions: aiSessions ?? [],
  };
}

/**
 * Save a snapshot in the settings collection (Firestore).
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
    return JSON.parse(raw) as BackupSnapshot;
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
    return JSON.parse(raw) as BackupMeta[];
  } catch {
    return [];
  }
}

/**
 * Create a backup and persist it in Firestore settings.
 */
export async function createBackup(reason = 'manual'): Promise<BackupSnapshot> {
  const snapshot = await createBackupSnapshot(reason);
  await saveBackupInDb(snapshot);
  return snapshot;
}

/**
 * Restore all user data from a snapshot.
 * Wipes the Firestore collections, then re-inserts decks (mapping old IDs →
 * new Firestore doc IDs), cards with full SM-2 state, reviews (remapping card
 * IDs), AI sessions and settings.
 */
export async function restoreFromSnapshot(snapshot: BackupSnapshot): Promise<{
  decks: number;
  cards: number;
  reviews: number;
}> {
  // 1) Wipe in FK order
  await clearAllUserData();

  const decks = snapshot.decks ?? [];
  const cards = snapshot.cards ?? [];
  const reviews = snapshot.reviews ?? [];
  const aiSessions = snapshot.aiSessions ?? [];
  const settings = snapshot.settings ?? [];

  // 2) Re-insert decks, build oldId → newId map
  const deckIdMap = new Map<string, string>();
  for (const d of decks) {
    if (!d || d.id == null) continue;
    const created = await insertDeck(
      d.name ?? 'Restored deck',
      d.description ?? '',
      first(d.studyMaterial, d.study_material),
      first(d.createdAt, d.created_at)
    );
    deckIdMap.set(String(d.id), created.id);
  }

  // 3) Re-insert cards with full SM-2 state, mapping deck_id
  const cardIdMap = new Map<string, string>();
  for (const c of cards) {
    if (!c) continue;
    const oldDeckId = first(c.deckId, c.deck_id);
    const newDeckId = oldDeckId == null ? undefined : deckIdMap.get(String(oldDeckId));
    if (!newDeckId) continue; // skip orphaned cards

    const created = await createCard({
      deckId: newDeckId,
      cardType: (c.cardType ?? c.card_type) === 'cloze' ? 'cloze' : 'basic',
      front: c.front ?? '',
      back: c.back ?? '',
      tag: c.tag ?? '',
      imagePath: first(c.imagePath, c.image_path),
      codeSnippet: coerceJson(first(c.codeSnippet, c.code_snippet)) as { code: string; language: string } | undefined,
      topology: coerceJson(c.topology) as NetworkTopology | undefined,
    });

    if (c.id != null) cardIdMap.set(String(c.id), created.id);

    await updateCard(created.id, {
      bookmarked: c.bookmarked === true || c.bookmarked === 1,
      reps: first(c.reps, 0) ?? 0,
      interval: first(c.interval, c.interval_days, 0) ?? 0,
      easeFactor: first(c.easeFactor, c.ease_factor, 2.5) ?? 2.5,
      dueDate: first(c.dueDate, c.due_date, todayStr()) ?? '',
      lastReviewedAt: first(c.lastReviewedAt, c.last_reviewed_at),
    });
  }

  // 4) Re-insert reviews with mapped card_id
  for (const rv of reviews) {
    if (!rv) continue;
    const oldCardId = first(rv.cardId, rv.card_id);
    const newCardId = oldCardId == null ? undefined : cardIdMap.get(String(oldCardId));
    if (!newCardId) continue;
    await addReviewHistory({
      cardId: newCardId,
      rating: first(rv.rating, 0) ?? 0,
      timestamp: first(rv.timestamp, rv.reviewed_at, nowIso()) ?? '',
      previousInterval: first(rv.previousInterval, rv.prev_interval, 0) ?? 0,
      nextInterval: first(rv.nextInterval, rv.new_interval, 0) ?? 0,
      previousEaseFactor: first(rv.previousEaseFactor, rv.prev_ease, 2.5) ?? 2.5,
      nextEaseFactor: first(rv.nextEaseFactor, rv.new_ease, 2.5) ?? 2.5,
    });
  }

  // 5) Re-insert AI sessions (deck link intentionally dropped — ids changed)
  for (const s of aiSessions) {
    if (!s) continue;
    await saveAiSession({
      sessionType: (s.sessionType ?? s.session_type) === 'generate' ? 'generate' : 'clean',
      inputText: first(s.inputText, s.input_text, '') ?? '',
      outputText: first(s.outputText, s.output_text),
      cardsJson: first(s.cardsJson, s.cards_json),
      deckName: first(s.deckName, s.deck_name),
      cardCount: first(s.cardCount, s.card_count, 0) ?? 0,
    });
  }

  // 6) Restore settings (excluding backup keys to avoid loops)
  for (const s of settings) {
    if (!s || typeof s.key !== 'string') continue;
    if (s.key.startsWith('backup:')) continue;
    await setSetting(s.key, typeof s.value === 'string' ? s.value : JSON.stringify(s.value ?? ''));
  }

  return {
    decks: decks.length,
    cards: cards.length,
    reviews: reviews.length,
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
  const today = todayStr();
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
  return true;
}