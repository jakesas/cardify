// Firestore Sync Types & Schema Design
// Collection: users/{uid}/decks/{deckId}
// Collection: users/{uid}/cards/{cardId}
// Collection: users/{uid}/reviews/{reviewId}
// Collection: users/{uid}/settings/{key}
// Collection: users/{uid}/ai_sessions/{sessionId}

import { Deck, Card, ReviewHistory } from '../types';

// Base sync metadata added to every entity
export interface SyncMeta {
  // Local timestamps
  updatedAt: string;        // ISO string - when entity was last modified locally
  syncedAt?: string;        // ISO string - when entity was last successfully synced to Firestore
  // Conflict resolution
  version: number;          // Incremented on each local change
  // Device tracking (optional, for debugging)
  deviceId?: string;        // Unique per browser/app instance
}

export interface FirestoreDeck extends Omit<Deck, 'updatedAt'>, SyncMeta {
  // Deck-specific sync fields
  // Note: cards are in subcollection cards/
}

export interface FirestoreCard extends Omit<Card, 'updatedAt'>, SyncMeta {
  // Card-specific sync fields
}

export interface FirestoreReview extends ReviewHistory, SyncMeta {
  // Review-specific sync fields
}

// Sync state tracking (stored in settings or separate collection)
export interface SyncState {
  lastFullSyncAt?: string;      // Last successful full sync
  lastIncrementalSyncAt?: string;
  pendingWrites: number;         // Count of unsynced local changes
  lastError?: string;            // Last sync error message
  lastErrorAt?: string;
  isOnline: boolean;
  deviceId: string;             // This device's unique identifier
}

// Firestore collection paths
export const SYNC_COLLECTIONS = {
  decks: (uid: string) => `users/${uid}/decks`,
  cards: (uid: string) => `users/${uid}/cards`,
  reviews: (uid: string) => `users/${uid}/reviews`,
  settings: (uid: string) => `users/${uid}/settings`,
  aiSessions: (uid: string) => `users/${uid}/ai_sessions`,
  // Metadata for sync state lives as fields on the user doc itself.
  // Paths must contain an EVEN number of segments to be a valid Firestore
  // document reference; decks/cards/reviews are subcollections under it.
  syncState: (uid: string) => `users/${uid}`,
} as const;

// Convert local entity → Firestore document (adds sync metadata)
export function serialize<T extends object>(data: T): T {
  const clean = {} as T;
  for (const key of Object.keys(data) as (keyof T)[]) {
    if (data[key] !== undefined) clean[key] = data[key];
  }
  return clean;
}

export function toFirestoreDeck(deck: Deck, deviceId: string): FirestoreDeck {
  const now = new Date().toISOString();
  return serialize<FirestoreDeck>({
    ...deck,
    updatedAt: now,
    version: 1,
    syncedAt: undefined,
    deviceId,
  });
}

export function toFirestoreCard(card: Card, deviceId: string): FirestoreCard {
  const now = new Date().toISOString();
  return serialize<FirestoreCard>({
    ...card,
    updatedAt: now,
    version: 1,
    syncedAt: undefined,
    deviceId,
  });
}

export function toFirestoreReview(review: ReviewHistory, deviceId: string): FirestoreReview {
  const now = new Date().toISOString();
  return serialize<FirestoreReview>({
    ...review,
    updatedAt: now,
    version: 1,
    syncedAt: undefined,
    deviceId,
  });
}

// Convert Firestore document → local entity (strips sync metadata)
export function fromFirestoreDeck(doc: FirestoreDeck): Deck {
  const { updatedAt, syncedAt, version, deviceId, ...deck } = doc;
  return deck;
}

export function fromFirestoreCard(doc: FirestoreCard): Card {
  const { updatedAt, syncedAt, version, deviceId, ...card } = doc;
  return card;
}

export function fromFirestoreReview(doc: FirestoreReview): ReviewHistory {
  const { updatedAt, syncedAt, version, deviceId, ...review } = doc;
  return review;
}