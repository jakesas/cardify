import { getFirestore, collection, query, limit, getDocs, addDoc, doc, updateDoc, increment, getDoc, Timestamp, type Firestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation "${label}" timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export interface SharedDeckMeta {
  id: string;
  title: string;
  description: string;
  authorName: string;
  authorId: string;
  tags: string[];
  cardCount: number;
  createdAt: Timestamp;
  downloads: number;
}

export interface SharedDeckCard {
  front: string;
  back: string;
  tag: string;
  cardType?: 'basic' | 'cloze';
  codeSnippet?: { code: string; language: string };
  topology?: any;
}

export interface SharedDeck extends SharedDeckMeta {
  cards: SharedDeckCard[];
}

export interface CommunityResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

let _fs: Firestore | null = null;

function getCommunityDb(): Firestore | null {
  try {
    if (!_fs) {
      const auth = getAuth();
      if (!auth.app) return null;
      _fs = getFirestore(auth.app);
    }
    return _fs;
  } catch {
    return null;
  }
}

export async function listSharedDecks(max = 50): Promise<CommunityResult<SharedDeckMeta[]>> {
  try {
    const db = getCommunityDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    // Avoid orderBy to prevent Firestore index issues — sort client-side
    const q = query(collection(db, 'shared-decks'), limit(max * 2));
    const snapshot = await withTimeout(getDocs(q), 15000, 'listSharedDecks');
    const decks: SharedDeckMeta[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SharedDeckMeta));
    decks.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    return { success: true, data: decks.slice(0, max) };
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg.includes('timed out')) {
      return { success: false, error: 'Request timed out. Make sure Firestore is enabled in your Firebase Console (flashpoint-ccna).' };
    }
    return { success: false, error: msg || 'Failed to list shared decks' };
  }
}

export async function getSharedDeck(deckId: string): Promise<CommunityResult<SharedDeck>> {
  try {
    const db = getCommunityDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const d = await getDoc(doc(db, 'shared-decks', deckId));
    if (!d.exists()) return { success: false, error: 'Deck not found' };
    return { success: true, data: { id: d.id, ...d.data() } as SharedDeck };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to get deck' };
  }
}

export async function uploadSharedDeck(
  title: string,
  description: string,
  tags: string[],
  cards: SharedDeckCard[],
): Promise<CommunityResult<string>> {
  try {
    const db = getCommunityDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return { success: false, error: 'You must be logged in to share a deck' };

    const cleanCards = cards.map(c => JSON.parse(JSON.stringify(c)));

    const docRef = await withTimeout(addDoc(collection(db, 'shared-decks'), {
      title,
      description: description || `${cards.length} cards — imported from CCNA SRS`,
      authorName: user.displayName || user.email || 'Anonymous',
      authorId: user.uid,
      tags,
      cardCount: cards.length,
      cards: cleanCards,
      createdAt: Timestamp.now(),
      downloads: 0,
    }), 15000, 'uploadSharedDeck');

    return { success: true, data: docRef.id };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to upload deck' };
  }
}

export async function incrementDownload(id: string): Promise<void> {
  try {
    const db = getCommunityDb();
    if (!db) return;
    await updateDoc(doc(db, 'shared-decks', id), { downloads: increment(1) });
  } catch {
    // non-critical
  }
}

export async function deleteSharedDeck(deckId: string): Promise<CommunityResult<void>> {
  try {
    const db = getCommunityDb();
    if (!db) return { success: false, error: 'Firestore not available' };

    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return { success: false, error: 'Not authenticated' };

    const d = await getDoc(doc(db, 'shared-decks', deckId));
    if (!d.exists()) return { success: false, error: 'Deck not found' };
    const data = d.data() as SharedDeckMeta;
    if (data.authorId !== user.uid) return { success: false, error: 'You can only delete your own decks' };

    const { deleteDoc: deleteFirestoreDoc } = await import('firebase/firestore');
    await deleteFirestoreDoc(doc(db, 'shared-decks', deckId));
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete deck' };
  }
}
