// Firestore Sync Types & Schema Design
// Collection: users/{uid}/decks/{deckId}
// Collection: users/{uid}/cards/{cardId}
// Collection: users/{uid}/reviews/{reviewId}

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
  // Meta document for sync state
  syncState: (uid: string) => `users/${uid}/syncState`,
} as const;

// Convert local entity → Firestore document (adds sync metadata)
export function toFirestoreDeck(deck: Deck, deviceId: string): FirestoreDeck {
  const now = new Date().toISOString();
  return {
    ...deck,
    updatedAt: now,
    version: 1,
    syncedAt: undefined,
    deviceId,
  };
}

export function toFirestoreCard(card: Card, deviceId: string): FirestoreCard {
  const now = new Date().toISOString();
  return {
    ...card,
    updatedAt: now,
    version: 1,
    syncedAt: undefined,
    deviceId,
  };
}

export function toFirestoreReview(review: ReviewHistory, deviceId: string): FirestoreReview {
  const now = new Date().toISOString();
  return {
    ...review,
    updatedAt: now,
    version: 1,
    syncedAt: undefined,
    deviceId,
  };
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