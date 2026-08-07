import { getAuth, onAuthStateChanged, User, type Auth } from 'firebase/auth';
import type { FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  query,
  where,
  limit,
  enableNetwork,
  type Firestore,
} from 'firebase/firestore';
import { getFirebaseApp } from '../lib/firebase';
import {
  listDecks,
  getAllCards,
  getAllReviews,
  getSetting,
  setSetting,
  createDeck,
} from '../db/queries';
import { Deck, Card, ReviewHistory } from '../types';
import {
  toFirestoreDeck,
  toFirestoreCard,
  toFirestoreReview,
  fromFirestoreDeck,
  SYNC_COLLECTIONS,
  SyncState,
} from './syncTypes';

// Firebase is initialized lazily inside initializeSync(). The module must NOT
// touch getFirebaseApp()/getFirestore() at import time — importing this file
// happens before AuthProvider's effect calls initFirebase(), so a top-level
// getFirebaseApp() here throws "Firebase not initialized" and crashes the app.
let app!: FirebaseApp;
let db!: Firestore;
let auth!: Auth;

function ensureFirebase(): void {
  if (!app) {
    app = getFirebaseApp();
  }
  if (!db) {
    db = getFirestore(app);
  }
  if (!auth) {
    auth = getAuth(app);
  }
}

const SYNC_INTERVAL_MS = 30 * 1000; // 30 seconds
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_BATCH_SIZE = 500; // Firestore batch limit

let syncState: SyncState = {
  pendingWrites: 0,
  isOnline: true,
  deviceId: generateDeviceId(),
};

let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let currentUser: User | null = null;
let unsubscribeAuth: (() => void) | null = null;

// Generate a unique device ID (stored in localStorage)
function generateDeviceId(): string {
  let id = localStorage.getItem('sync-device-id');
  if (!id) {
    id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('sync-device-id', id);
  }
  return id;
}

// --- Offline Write Queue ---

interface QueuedOperation {
  type: 'create' | 'update' | 'delete';
  collection: 'decks' | 'cards' | 'reviews';
  data: any;
  timestamp: string;
  retryCount: number;
}

async function enqueueOperation(op: Omit<QueuedOperation, 'timestamp' | 'retryCount'>): Promise<void> {
  const raw = await getSetting('sync:offlineQueue');
  const queue: QueuedOperation[] = raw ? JSON.parse(raw) : [];
  queue.push({ ...op, timestamp: new Date().toISOString(), retryCount: 0 });
  await setSetting('sync:offlineQueue', JSON.stringify(queue));
  syncState.pendingWrites = queue.length;
}

async function getOfflineQueue(): Promise<QueuedOperation[]> {
  const raw = await getSetting('sync:offlineQueue');
  return raw ? JSON.parse(raw) : [];
}

async function clearOfflineQueue(): Promise<void> {
  await setSetting('sync:offlineQueue', '[]');
  syncState.pendingWrites = 0;
}

async function removeFromQueue(index: number): Promise<void> {
  const queue = await getOfflineQueue();
  queue.splice(index, 1);
  await setSetting('sync:offlineQueue', JSON.stringify(queue));
  syncState.pendingWrites = queue.length;
}

// --- Core Sync Functions ---

function getUserCollections(uid: string) {
  return {
    decks: collection(db, SYNC_COLLECTIONS.decks(uid)),
    cards: collection(db, SYNC_COLLECTIONS.cards(uid)),
    reviews: collection(db, SYNC_COLLECTIONS.reviews(uid)),
    syncState: doc(db, SYNC_COLLECTIONS.syncState(uid)),
  };
}

// Push local changes to Firestore
  async function pushLocalChanges(uid: string): Promise<void> {
    const cols = getUserCollections(uid);

    // Decks: find locally modified since last sync
    const localDecks = await listDecks();
    for (const deck of localDecks) {
      const deckRef = doc(cols.decks, deck.id);
      const remoteSnap = await getDoc(deckRef);

      if (!remoteSnap.exists()) {
        // New deck - create
        const firestoreDeck = toFirestoreDeck(deck as any, syncState.deviceId);
        await setDoc(deckRef, firestoreDeck);
      } else {
        const remote = remoteSnap.data() as any;
        const localUpdated = new Date(deck.updatedAt || deck.createdAt || new Date().toISOString()).getTime();
        const remoteUpdated = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;

        if (localUpdated > remoteUpdated) {
          // Local is newer - push
          const firestoreDeck = toFirestoreDeck(deck as any, syncState.deviceId);
          await setDoc(deckRef, firestoreDeck);
        }
      }
    }

    // Cards: push modified since last sync
    const localCards = await getAllCards();
    for (const card of localCards) {
      const cardRef = doc(cols.cards, card.id);
      const remoteSnap = await getDoc(cardRef);

      if (!remoteSnap.exists()) {
        const firestoreCard = toFirestoreCard(card as any, syncState.deviceId);
        await setDoc(cardRef, firestoreCard);
      } else {
        const remote = remoteSnap.data() as any;
        const localUpdated = new Date(card.updatedAt || card.createdAt || new Date().toISOString()).getTime();
        const remoteUpdated = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;

        if (localUpdated > remoteUpdated) {
          const firestoreCard = toFirestoreCard(card as any, syncState.deviceId);
          await setDoc(cardRef, firestoreCard);
        }
      }
    }

    // Reviews: push new reviews (reviews are append-only)
    const localReviews = await getAllReviews();
    for (const review of localReviews) {
      const reviewRef = doc(cols.reviews, review.id);
      const remoteSnap = await getDoc(reviewRef);
      if (!remoteSnap.exists()) {
        const firestoreReview = toFirestoreReview(review as any, syncState.deviceId);
        await setDoc(reviewRef, firestoreReview);
      }
    }
  }

// Pull remote changes from Firestore
async function pullRemoteChanges(uid: string): Promise<void> {
  const cols = getUserCollections(uid);

  // Get last sync timestamp
  const syncStateDoc = await getDoc(cols.syncState);
  const lastSync = syncStateDoc.exists() ? syncStateDoc.data()?.lastIncrementalSyncAt : null;
  const lastSyncTime = lastSync ? new Date(lastSync).getTime() : 0;

  // Pull decks updated since last sync
  const decksQuery = query(
    cols.decks,
    where('updatedAt', '>', new Date(lastSyncTime).toISOString())
  );
  const decksSnap = await getDocs(decksQuery);
  for (const docSnap of decksSnap.docs) {
    const remote = docSnap.data() as any;
    const localDecks = await listDecks();
    const local = localDecks.find(d => d.id === docSnap.id);

    if (!local) {
      // New deck from remote - create locally
      const deck = fromFirestoreDeck(remote);
      await createDeck(deck.name, deck.description);
      // Note: created deck gets new ID, need to handle ID mapping
      // For simplicity, we'll use the remote ID if possible
    } else {
      const localUpdated = new Date(local.updatedAt || local.createdAt).getTime();
      const remoteUpdated = new Date(remote.updatedAt).getTime();
      if (remoteUpdated > localUpdated) {
        // Remote is newer - update local
        // Need to implement updateDeck in queries
      }
    }
  }

  // Similar for cards and reviews...
  // (Implementation continues for cards and reviews)
}

// Update sync state in Firestore
async function updateSyncState(uid: string): Promise<void> {
  const cols = getUserCollections(uid);
  await setDoc(cols.syncState, {
    lastIncrementalSyncAt: new Date().toISOString(),
    lastFullSyncAt: syncState.lastFullSyncAt,
    deviceId: syncState.deviceId,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

// --- Full Sync Orchestration ---

async function performSync(uid: string): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;

  try {
    await enableNetwork(db);
    syncState.isOnline = true;

    // Push local → remote
    await pushLocalChanges(uid);

    // Pull remote → local (simplified for now)
    // await pullRemoteChanges(uid);

    await updateSyncState(uid);

    syncState.lastIncrementalSyncAt = new Date().toISOString();
    await setSetting('sync:lastIncrementalSyncAt', syncState.lastIncrementalSyncAt);

    // Flush offline queue
    await flushOfflineQueue(uid);

  } catch (error) {
    console.error('[Sync] Sync failed:', error);
    syncState.isOnline = false;
    syncState.lastError = error instanceof Error ? error.message : String(error);
    syncState.lastErrorAt = new Date().toISOString();
    await setSetting('sync:lastError', syncState.lastError);
    await setSetting('sync:lastErrorAt', syncState.lastErrorAt);
  } finally {
    isSyncing = false;
  }
}

// Flush offline queue with retry logic
async function flushOfflineQueue(uid: string): Promise<void> {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return;

  const cols = getUserCollections(uid);

  for (let i = queue.length - 1; i >= 0; i--) {
    const op = queue[i];
    try {
      const batch = writeBatch(db);
      
      const ref = doc(cols[op.collection], op.data.id || `temp-${Date.now()}`);
      
      if (op.type === 'create') {
        batch.set(ref, op.data);
      } else if (op.type === 'update') {
        batch.update(ref, op.data);
      } else if (op.type === 'delete') {
        batch.delete(ref);
      }
      
      await batch.commit();
      await removeFromQueue(i);
    } catch (error) {
      op.retryCount++;
      if (op.retryCount >= MAX_RETRY_ATTEMPTS) {
        console.error('[Sync] Operation failed permanently:', op, error);
        await removeFromQueue(i);
      }
      await new Promise(r => setTimeout(r, BASE_RETRY_DELAY_MS * Math.pow(2, op.retryCount)));
    }
  }
}

// --- Sync Loop & Lifecycle ---

export async function initializeSync(user: User): Promise<void> {
  ensureFirebase();
  currentUser = user;
  syncState.deviceId = generateDeviceId();

  // Load persisted sync state
  const lastSync = await getSetting('sync:lastIncrementalSyncAt');
  if (lastSync) syncState.lastIncrementalSyncAt = lastSync;
  const fullSync = await getSetting('sync:lastFullSyncAt');
  if (fullSync) syncState.lastFullSyncAt = fullSync;

  // Listen for auth changes
  unsubscribeAuth = onAuthStateChanged(auth, (newUser) => {
    if (newUser && newUser.uid !== currentUser?.uid) {
      currentUser = newUser;
      // Restart sync for new user
      startSyncLoop();
    } else if (!newUser) {
      currentUser = null;
      stopSyncLoop();
    }
  });

  // Initial sync
  await performFullSync(user.uid);

  // Start periodic sync
  startSyncLoop();

  // Listen for online/offline
  window.addEventListener('online', () => {
    syncState.isOnline = true;
    if (currentUser) performSync(currentUser.uid);
  });
  window.addEventListener('offline', () => {
    syncState.isOnline = false;
  });
}

async function performFullSync(uid: string): Promise<void> {
  // Initial full sync - upload all local data to Firestore if empty
  const cols = getUserCollections(uid);
  
  // Check if Firestore already has data
  const decksSnap = await getDocs(query(cols.decks, limit(1)));
  const cardsSnap = await getDocs(query(cols.cards, limit(1)));
  const reviewsSnap = await getDocs(query(cols.reviews, limit(1)));
  
  const firestoreEmpty = decksSnap.empty && cardsSnap.empty && reviewsSnap.empty;
  
  if (firestoreEmpty) {
    console.log('[Sync] Firestore empty - performing initial full upload');
    
    // Upload all decks
    const localDecks = await listDecks();
    const deckBatch = writeBatch(db);
    for (const deck of localDecks) {
      const deckRef = doc(cols.decks, deck.id);
      const firestoreDeck = toFirestoreDeck(deck as any, syncState.deviceId);
      deckBatch.set(deckRef, firestoreDeck);
    }
    await deckBatch.commit();
    
    // Upload all cards in batches (Firestore limit 500)
    const localCards = await getAllCards();
    for (let i = 0; i < localCards.length; i += MAX_BATCH_SIZE) {
      const batch = writeBatch(db);
      const batchCards = localCards.slice(i, i + MAX_BATCH_SIZE);
      for (const card of batchCards) {
        const cardRef = doc(cols.cards, card.id);
        const firestoreCard = toFirestoreCard(card as any, syncState.deviceId);
        batch.set(cardRef, firestoreCard);
      }
      await batch.commit();
    }
    
    // Upload all reviews in batches
    const localReviews = await getAllReviews();
    for (let i = 0; i < localReviews.length; i += MAX_BATCH_SIZE) {
      const batch = writeBatch(db);
      const batchReviews = localReviews.slice(i, i + MAX_BATCH_SIZE);
      for (const review of batchReviews) {
        const reviewRef = doc(cols.reviews, review.id);
        const firestoreReview = toFirestoreReview(review as any, syncState.deviceId);
        batch.set(reviewRef, firestoreReview);
      }
      await batch.commit();
    }
    
    console.log('[Sync] Initial full upload complete');
  } else {
    console.log('[Sync] Firestore has data - skipping full upload');
  }
  
  // Then do incremental sync
  await performSync(uid);
  syncState.lastFullSyncAt = new Date().toISOString();
  await setSetting('sync:lastFullSyncAt', syncState.lastFullSyncAt);
}

function startSyncLoop(): void {
  if (syncIntervalId) return;
  syncIntervalId = setInterval(() => {
    if (currentUser && syncState.isOnline && !isSyncing) {
      performSync(currentUser.uid);
    }
  }, SYNC_INTERVAL_MS);
}

function stopSyncLoop(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
  if (unsubscribeAuth) {
    unsubscribeAuth();
    unsubscribeAuth = null;
  }
}

// --- Public API ---

export function getSyncState(): SyncState {
  return { ...syncState };
}

export function isSyncActive(): boolean {
  return isSyncing;
}

export async function triggerManualSync(): Promise<void> {
  if (currentUser) {
    await performSync(currentUser.uid);
  }
}

export async function queueOfflineWrite(
  type: 'create' | 'update' | 'delete',
  collection: 'decks' | 'cards' | 'reviews',
  data: any
): Promise<void> {
  await enqueueOperation({ type, collection, data });
}

export function shutdownSync(): void {
  stopSyncLoop();
}