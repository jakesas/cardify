// One-time legacy IndexedDB -> Firestore migration.
//
// Before the Firebase rewrite the app persisted per-user data in an IndexedDB
// database named `ccna-srs-<uid>` (the old db/browserDb.ts layer). This module
// copies that data into the current user's Firestore collections and mark
// `migration_v1` (in the user's settings collection) so it never runs twice.
//
// Design notes:
//  - Uses the raw `indexedDB` API on purpose: the `idb` package is being
//    pruned along with the rest of the local storage layer.
//  - Legacy row ids (auto-increment numbers) are stringified and reused as
//    Firestore document ids, so a card's `deckId` and a review's `cardId`
//    keep pointing at the right documents with no remapping table.
//  - Migration is additive: nothing in Firestore is ever deleted, only the
//    legacy IndexedDB is removed after a successful run.
//  - Idempotent (flag-gated) and non-blocking (swallows errors and returns a
//    summary instead of throwing, so App init never crashes on migration).

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  type CollectionReference,
} from 'firebase/firestore';
import { getFirebaseApp } from '../lib/firebase';
import { Card, Deck, ReviewHistory } from '../types';
import {
  toFirestoreDeck,
  toFirestoreCard,
  toFirestoreReview,
  serialize,
  SYNC_COLLECTIONS,
  FirestoreDeck,
  FirestoreCard,
  FirestoreReview,
} from './syncTypes';
import type { AiSession } from '../db/queries';

const MIGRATION_FLAG = 'migration_v1';
const DEVICE_ID = 'migration-v1';
const WRITE_BATCH = 400;
const SKIPPED_SETTINGS = new Set(['db_schema']);

// --- Legacy IndexedDB row shapes (old db/browserDb.ts + SQL schema) --------

interface LegacyDeckRow {
  id: number;
  name?: string;
  description?: string | null;
  study_material?: string | null;
  created_at?: string;
}

interface LegacyCardRow {
  id: number;
  deck_id: number;
  card_type?: string;
  front?: string;
  back?: string;
  tag?: string;
  image_path?: string | null;
  code_snippet?: string | null;
  topology?: string | null;
  bookmarked?: number | boolean;
  reps?: number;
  interval_days?: number;
  ease_factor?: number;
  due_date?: string;
  last_reviewed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface LegacyReviewRow {
  id: number;
  card_id: number;
  rating?: number;
  reviewed_at?: string;
  prev_interval?: number;
  new_interval?: number;
  prev_ease?: number;
  new_ease?: number;
}

interface LegacySettingRow {
  key?: string;
  value?: unknown;
}

interface LegacyAiSessionRow {
  id: number;
  session_type?: string;
  input_text?: string;
  output_text?: string | null;
  cards_json?: string | null;
  deck_id?: number | null;
  deck_name?: string | null;
  card_count?: number;
  created_at?: string;
}

export interface MigrationSummary {
  migrated: boolean;
  decks: number;
  cards: number;
  reviews: number;
  settings: number;
  aiSessions: number;
}

const EMPTY_SUMMARY: MigrationSummary = {
  migrated: false,
  decks: 0,
  cards: 0,
  reviews: 0,
  settings: 0,
  aiSessions: 0,
};

// --- Raw IndexedDB helpers -------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function openLegacyDb(dbName: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(dbName);
    } catch {
      resolve(null);
      return;
    }
    // Opening a missing/older database fires onupgradeneeded, which would
    // CREATE the schema. We only want to read — abort the upgrade instead.
    request.onupgradeneeded = () => {
      try {
        request.transaction?.abort();
      } catch {
        /* ignore */
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function getAllFromStore(db: IDBDatabase, storeName: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve((request.result as unknown[]) ?? []);
      request.onerror = () => reject(request.error);
    } catch {
      resolve([]); // store does not exist in this database
    }
  });
}

function deleteLegacyDb(dbName: string): Promise<void> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.deleteDatabase(dbName);
    } catch {
      resolve();
      return;
    }
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve(); // connection open elsewhere — best effort
  });
}

// --- Legacy row -> entity mappers -----------------------------------------

function parseJson<T>(raw: string | null | undefined): T | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function mapDeck(row: LegacyDeckRow): Deck {
  return {
    id: String(row.id),
    name: row.name ?? 'Imported deck',
    description: row.description ?? '',
    studyMaterial: row.study_material ?? undefined,
    createdAt: row.created_at ?? nowIso(),
  };
}

function mapCard(row: LegacyCardRow): Card {
  return {
    id: String(row.id),
    deckId: String(row.deck_id),
    cardType: row.card_type === 'cloze' ? 'cloze' : 'basic',
    front: row.front ?? '',
    back: row.back ?? '',
    tag: row.tag ?? '',
    imagePath: row.image_path ?? undefined,
    codeSnippet: parseJson(row.code_snippet),
    topology: parseJson(row.topology),
    bookmarked: row.bookmarked === 1 || row.bookmarked === true,
    reps: row.reps ?? 0,
    interval: row.interval_days ?? 0,
    easeFactor: row.ease_factor ?? 2.5,
    dueDate: row.due_date ?? nowIso().split('T')[0],
    lastReviewedAt: row.last_reviewed_at ?? undefined,
    createdAt: row.created_at ?? nowIso(),
    updatedAt: row.updated_at ?? nowIso(),
  };
}

function mapReview(row: LegacyReviewRow): ReviewHistory {
  return {
    id: String(row.id),
    cardId: String(row.card_id),
    rating: row.rating ?? 0,
    timestamp: row.reviewed_at ?? nowIso(),
    previousInterval: row.prev_interval ?? 0,
    nextInterval: row.new_interval ?? 0,
    previousEaseFactor: row.prev_ease ?? 2.5,
    nextEaseFactor: row.new_ease ?? 2.5,
  };
}

function mapAiSession(row: LegacyAiSessionRow): AiSession {
  return {
    id: String(row.id),
    sessionType: row.session_type === 'generate' ? 'generate' : 'clean',
    inputText: row.input_text ?? '',
    outputText: row.output_text ?? undefined,
    cardsJson: row.cards_json ?? undefined,
    deckId: row.deck_id != null ? String(row.deck_id) : undefined,
    deckName: row.deck_name ?? undefined,
    cardCount: row.card_count ?? 0,
    createdAt: row.created_at ?? nowIso(),
  };
}

// --- Firestore writes ------------------------------------------------------

async function putAll<T extends object>(
  colRef: CollectionReference<T>,
  records: Array<{ id: string; data: T }>
): Promise<number> {
  const fs = getFirestore(getFirebaseApp());
  let written = 0;
  for (let i = 0; i < records.length; i += WRITE_BATCH) {
    const batch = writeBatch(fs);
    for (const record of records.slice(i, i + WRITE_BATCH)) {
      // Firestore rejects undefined field values — strip them from legacy rows.
      batch.set(doc(colRef, record.id), serialize(record.data));
      written++;
    }
    await batch.commit();
  }
  return written;
}

// --- Public API ------------------------------------------------------------

/**
 * Copies the legacy `ccna-srs-<uid>` IndexedDB database into the user's
 * Firestore collections. Safe to call on every app start: it is gated by the
 * `migration_v1` setting and never throws.
 */
export async function migrateLegacyData(uid: string): Promise<MigrationSummary> {
  const dbName = `ccna-srs-${uid}`;

  try {
    const fs = getFirestore(getFirebaseApp());
    const settingsRef = collection(fs, SYNC_COLLECTIONS.settings(uid)) as CollectionReference<{
      value: string;
      updatedAt?: string;
    }>;

    // Idempotency: already migrated for this user?
    const flagSnap = await getDoc(doc(settingsRef, MIGRATION_FLAG));
    if (flagSnap.exists()) {
      return { ...EMPTY_SUMMARY, migrated: true };
    }

    // Open the legacy per-user web database. Missing/empty -> nothing to do.
    const db = await openLegacyDb(dbName);
    if (!db) {
      await setDoc(doc(settingsRef, MIGRATION_FLAG), { value: 'done', updatedAt: nowIso() });
      return { ...EMPTY_SUMMARY, migrated: true };
    }

    const decksRef = collection(fs, SYNC_COLLECTIONS.decks(uid)) as CollectionReference<FirestoreDeck>;
    const cardsRef = collection(fs, SYNC_COLLECTIONS.cards(uid)) as CollectionReference<FirestoreCard>;
    const reviewsRef = collection(fs, SYNC_COLLECTIONS.reviews(uid)) as CollectionReference<FirestoreReview>;
    const aiSessionsRef = collection(fs, SYNC_COLLECTIONS.aiSessions(uid)) as CollectionReference<AiSession>;

    const summary: MigrationSummary = { ...EMPTY_SUMMARY };

    // 1. Decks
    const deckRows = (await getAllFromStore(db, 'decks')) as LegacyDeckRow[];
    const decks = deckRows.map(mapDeck);
    const deckIds = new Set(decks.map((d) => d.id));
    summary.decks = await putAll(
      decksRef,
      decks.map((d) => ({ id: d.id, data: toFirestoreDeck(d, DEVICE_ID) }))
    );

    // 2. Cards (skip orphans whose deck never made it over)
    const cardRows = (await getAllFromStore(db, 'cards')) as LegacyCardRow[];
    const cards = cardRows.map(mapCard).filter((c) => deckIds.has(c.deckId));
    const cardIds = new Set(cards.map((c) => c.id));
    summary.cards = await putAll(
      cardsRef,
      cards.map((c) => ({ id: c.id, data: toFirestoreCard(c, DEVICE_ID) }))
    );

    // 3. Reviews (skip orphans whose card never made it over)
    const reviewRows = (await getAllFromStore(db, 'reviews')) as LegacyReviewRow[];
    const reviews = reviewRows.map(mapReview).filter((r) => cardIds.has(r.cardId));
    summary.reviews = await putAll(
      reviewsRef,
      reviews.map((r) => ({ id: r.id, data: toFirestoreReview(r, DEVICE_ID) }))
    );

    // 4. Settings (skip legacy schema markers and old sync-engine internals)
    const settingRows = (await getAllFromStore(db, 'settings')) as LegacySettingRow[];
    for (const row of settingRows) {
      if (typeof row.key !== 'string' || !row.key) continue;
      if (row.key.startsWith('sync:')) continue;
      if (SKIPPED_SETTINGS.has(row.key)) continue;
      const value = typeof row.value === 'string' ? row.value : row.value == null ? '' : JSON.stringify(row.value);
      await setDoc(doc(settingsRef, row.key), { value, updatedAt: nowIso() });
      summary.settings++;
    }

    // 5. AI sessions
    const aiRows = (await getAllFromStore(db, 'ai_sessions')) as LegacyAiSessionRow[];
    const aiSessions = aiRows.map(mapAiSession);
    summary.aiSessions = await putAll(
      aiSessionsRef,
      aiSessions.map((s) => ({ id: s.id, data: s }))
    );

    db.close();

    // Mark migration complete ONLY after every write above succeeded.
    await setDoc(doc(settingsRef, MIGRATION_FLAG), { value: 'done', updatedAt: nowIso() });

    // Best-effort removal of the legacy database.
    await deleteLegacyDb(dbName);

    summary.migrated = true;
    if (summary.decks > 0 || summary.cards > 0 || summary.reviews > 0 || summary.settings > 0 || summary.aiSessions > 0) {
      console.log('[migrate] Legacy IndexedDB -> Firestore migration complete', summary);
    }
    return summary;
  } catch (err) {
    // Non-blocking: never take App init down with the migration.
    console.error('[migrate] Legacy migration failed (continuing without it):', err);
    return EMPTY_SUMMARY;
  }
}