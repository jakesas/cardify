import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  type Firestore,
  type CollectionReference,
  type Query,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Deck, Card, ReviewHistory, NetworkTopology } from '../types';
import { calculateSM2, getLocalDateString } from '../utils/sm2';
import {
  toFirestoreDeck,
  toFirestoreCard,
  toFirestoreReview,
  serialize,
  SYNC_COLLECTIONS,
  FirestoreDeck,
  FirestoreCard,
  FirestoreReview,
} from '../utils/syncTypes';

let _fs: Firestore | null = null;

function getFs(): Firestore {
  if (!_fs) {
    const auth = getAuth();
    if (!auth.app) throw new Error('Firebase not initialized');
    _fs = getFirestore(auth.app);
  }
  return _fs;
}

let currentUid: string | null = null;

/** Call when the auth user changes. All Firestore reads/writes are scoped to this uid. */
export function setDbUser(userId: string | null): void {
  currentUid = userId;
}

function uid(): string {
  if (!currentUid) throw new Error('No user session — call setDbUser() first');
  return currentUid;
}

export interface UserCollections {
  decks: CollectionReference<FirestoreDeck>;
  cards: CollectionReference<FirestoreCard>;
  reviews: CollectionReference<FirestoreReview>;
  settings: CollectionReference<{ value: string; updatedAt?: string }>;
  aiSessions: CollectionReference<AiSession>;
}

export function userCollections(u: string): UserCollections {
  const fs = getFs();
  return {
    decks: collection(fs, SYNC_COLLECTIONS.decks(u)) as CollectionReference<FirestoreDeck>,
    cards: collection(fs, SYNC_COLLECTIONS.cards(u)) as CollectionReference<FirestoreCard>,
    reviews: collection(fs, SYNC_COLLECTIONS.reviews(u)) as CollectionReference<FirestoreReview>,
    settings: collection(fs, SYNC_COLLECTIONS.settings(u)) as CollectionReference<{ value: string; updatedAt?: string }>,
    aiSessions: collection(fs, SYNC_COLLECTIONS.aiSessions(u)) as CollectionReference<AiSession>,
  };
}

function cols(u: string): UserCollections {
  return userCollections(u);
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function sortByDesc<T>(items: T[], pick: (t: T) => string | undefined): T[] {
  return [...items].sort((a, b) => (pick(b) ?? '').localeCompare(pick(a) ?? ''));
}

export function toDeck(snap: QueryDocumentSnapshot<FirestoreDeck>): Deck {
  const d = snap.data();
  return {
    id: snap.id,
    name: d.name,
    description: d.description ?? '',
    studyMaterial: d.studyMaterial,
    createdAt: d.createdAt,
  };
}

export function toCard(snap: QueryDocumentSnapshot<FirestoreCard>): Card {
  const d = snap.data();
  return {
    id: snap.id,
    deckId: String(d.deckId),
    cardType: d.cardType ?? 'basic',
    front: d.front ?? '',
    back: d.back ?? '',
    tag: d.tag ?? '',
    imagePath: d.imagePath,
    codeSnippet: d.codeSnippet,
    topology: d.topology,
    bookmarked: d.bookmarked === true,
    reps: d.reps ?? 0,
    interval: d.interval ?? 0,
    easeFactor: d.easeFactor ?? 2.5,
    dueDate: d.dueDate ?? '',
    lastReviewedAt: d.lastReviewedAt,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export function toReview(snap: QueryDocumentSnapshot<FirestoreReview>): ReviewHistory {
  const d = snap.data();
  return {
    id: snap.id,
    cardId: String(d.cardId),
    rating: d.rating,
    timestamp: d.timestamp,
    previousInterval: d.previousInterval,
    nextInterval: d.nextInterval,
    previousEaseFactor: d.previousEaseFactor,
    nextEaseFactor: d.nextEaseFactor,
  };
}

export async function listDecks(): Promise<Deck[]> {
  const snap = await getDocs(query(cols(uid()).decks));
  return sortByDesc(snap.docs.map(toDeck), (d) => d.createdAt);
}

export async function createDeck(name: string, description?: string): Promise<Deck> {
  const c = cols(uid());
  const ref = doc(c.decks);
  const now = nowIso();
  const deck: Deck = { id: ref.id, name, description: description ?? '', createdAt: now };
  await setDoc(ref, toFirestoreDeck(deck, 'web'));
  return deck;
}

export async function insertDeck(
  name: string,
  description: string,
  studyMaterial?: string,
  createdAt?: string
): Promise<Deck> {
  const c = cols(uid());
  const ref = doc(c.decks);
  const now = nowIso();
  const deck: Deck = {
    id: ref.id,
    name,
    description,
    studyMaterial,
    createdAt: createdAt ?? now,
  };
  await setDoc(ref, toFirestoreDeck(deck, 'web'));
  return deck;
}

export async function updateDeckName(deckId: string, name: string): Promise<Deck> {
  const c = cols(uid());
  const ref = doc(c.decks, deckId);
  const existing = await getDoc(ref);
  if (!existing.exists()) throw new Error('Deck not found');
  await updateDoc(ref, { name, updatedAt: nowIso() });
  const updated = await getDoc(ref);
  if (!updated.exists()) throw new Error('Deck not found');
  return toDeck(updated);
}

export async function updateDeckStudyMaterial(deckId: string, material: string): Promise<Deck> {
  const c = cols(uid());
  const ref = doc(c.decks, deckId);
  const existing = await getDoc(ref);
  if (!existing.exists()) throw new Error('Deck not found');
  await updateDoc(ref, { studyMaterial: material, updatedAt: nowIso() });
  const updated = await getDoc(ref);
  if (!updated.exists()) throw new Error('Deck not found');
  return toDeck(updated);
}

async function deleteDocsInBatches(colRef: CollectionReference<unknown>, ids: string[]): Promise<void> {
  const fs = getFs();
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(fs);
    for (const id of ids.slice(i, i + 400)) batch.delete(doc(colRef, id));
    await batch.commit();
  }
}

async function deleteCardsWithReviews(cardIds: string[]): Promise<void> {
  if (cardIds.length === 0) return;
  const c = cols(uid());
  const reviewIds: string[] = [];
  for (let i = 0; i < cardIds.length; i += 10) {
    const chunk = cardIds.slice(i, i + 10);
    const reviewSnap = await getDocs(query(c.reviews, where('cardId', 'in', chunk)));
    reviewIds.push(...reviewSnap.docs.map((d) => d.id));
  }
  await deleteDocsInBatches(c.reviews, reviewIds);
  await deleteDocsInBatches(c.cards, cardIds);
}

export async function deleteDeck(deckId: string): Promise<void> {
  const c = cols(uid());
  const cardSnap = await getDocs(query(c.cards, where('deckId', '==', deckId)));
  await deleteCardsWithReviews(cardSnap.docs.map((d) => d.id));
  await deleteDoc(doc(c.decks, deckId));
}

export async function getDueCards(deckId: string, limit?: number): Promise<Card[]> {
  const c = cols(uid());
  const snap = await getDocs(query(c.cards, where('deckId', '==', deckId)));
  const today = todayStr();
  const due = snap.docs
    .map(toCard)
    .filter((cd) => (cd.dueDate ?? '') <= today)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  return limit ? due.slice(0, limit) : due;
}

export async function getAllCards(): Promise<Card[]> {
  const snap = await getDocs(query(cols(uid()).cards));
  return sortByDesc(snap.docs.map(toCard), (c) => c.createdAt);
}

export interface CreateCardInput {
  deckId: string;
  front: string;
  back: string;
  cardType?: 'basic' | 'cloze';
  tag: string;
  imagePath?: string;
  codeSnippet?: { code: string; language: string };
  topology?: NetworkTopology;
}

export async function createCard(input: CreateCardInput): Promise<Card> {
  const c = cols(uid());
  const ref = doc(c.cards);
  const now = nowIso();
  const card: Card = {
    id: ref.id,
    deckId: input.deckId,
    cardType: input.cardType ?? 'basic',
    front: input.front,
    back: input.back,
    tag: input.tag,
    imagePath: input.imagePath,
    codeSnippet: input.codeSnippet,
    topology: input.topology,
    bookmarked: false,
    reps: 0,
    interval: 0,
    easeFactor: 2.5,
    dueDate: todayStr(),
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, toFirestoreCard(card, 'web'));
  return card;
}

const CARD_UPDATABLE: (keyof Card)[] = [
  'front',
  'back',
  'tag',
  'deckId',
  'imagePath',
  'codeSnippet',
  'topology',
  'bookmarked',
  'reps',
  'interval',
  'easeFactor',
  'dueDate',
  'lastReviewedAt',
];

export async function updateCard(cardId: string, fields: Partial<Card>): Promise<Card> {
  const c = cols(uid());
  const ref = doc(c.cards, cardId);
  const existing = await getDoc(ref);
  if (!existing.exists()) throw new Error('Card not found');

  const patch: Partial<FirestoreCard> & { updatedAt: string } = { updatedAt: nowIso() };
  for (const key of CARD_UPDATABLE) {
    const value = fields[key];
    if (value !== undefined) Object.assign(patch, { [key]: value });
  }
  if (Object.keys(patch).length === 1) throw new Error('No fields to update');

  await updateDoc(ref, patch);
  const updated = await getDoc(ref);
  if (!updated.exists()) throw new Error('Card not found');
  return toCard(updated);
}

export async function updateCards(ids: string[], fields: Partial<Card>): Promise<Card[]> {
  const updated: Card[] = [];
  for (const id of ids) updated.push(await updateCard(id, fields));
  return updated;
}

export async function deleteCard(cardId: string): Promise<void> {
  await deleteCardsWithReviews([cardId]);
}

export async function deleteCards(ids: string[]): Promise<void> {
  await deleteCardsWithReviews(ids);
}

export async function submitReview(cardId: string, rating: 1 | 2 | 3 | 4): Promise<Card> {
  const c = cols(uid());
  const fs = getFs();
  const cardRef = doc(c.cards, cardId);
  const cardSnap = await getDoc(cardRef);
  if (!cardSnap.exists()) throw new Error('Card not found');
  const card = toCard(cardSnap);

  const { reps, interval, easeFactor } = calculateSM2(rating, card.reps, card.interval, card.easeFactor);
  const dueDate = getLocalDateString(interval);
  const now = nowIso();

  const reviewRef = doc(c.reviews);
  const review: ReviewHistory = {
    id: reviewRef.id,
    cardId,
    rating,
    timestamp: now,
    previousInterval: card.interval,
    nextInterval: interval,
    previousEaseFactor: card.easeFactor,
    nextEaseFactor: easeFactor,
  };

  const batch = writeBatch(fs);
  batch.update(cardRef, { reps, interval, easeFactor, dueDate, lastReviewedAt: now, updatedAt: now });
  batch.set(reviewRef, toFirestoreReview(review, 'web'));
  await batch.commit();

  return { ...card, reps, interval, easeFactor, dueDate, lastReviewedAt: now };
}

export async function getReviewHistory(cardId: string): Promise<ReviewHistory[]> {
  const snap = await getDocs(query(cols(uid()).reviews, where('cardId', '==', cardId)));
  return sortByDesc(snap.docs.map(toReview), (r) => r.timestamp);
}

export async function getAllReviews(): Promise<ReviewHistory[]> {
  const snap = await getDocs(query(cols(uid()).reviews));
  return sortByDesc(snap.docs.map(toReview), (r) => r.timestamp);
}

export async function addReviewHistory(review: Omit<ReviewHistory, 'id'>): Promise<ReviewHistory> {
  const c = cols(uid());
  const ref = doc(c.reviews);
  const full: ReviewHistory = { id: ref.id, ...review };
  await setDoc(ref, toFirestoreReview(full, 'web'));
  return full;
}

export async function exportDeckToJson(deckId: string): Promise<string> {
  const c = cols(uid());
  const deckSnap = await getDoc(doc(c.decks, deckId));
  if (!deckSnap.exists()) throw new Error('Deck not found');

  const cardSnap = await getDocs(query(c.cards, where('deckId', '==', deckId)));
  const cards = cardSnap.docs.map(toCard);

  const reviews: ReviewHistory[] = [];
  for (let i = 0; i < cards.length; i += 10) {
    const chunk = cards.slice(i, i + 10).map((cd) => cd.id);
    const reviewSnap = await getDocs(query(c.reviews, where('cardId', 'in', chunk)));
    reviews.push(...reviewSnap.docs.map(toReview));
  }

  return JSON.stringify({ deck: toDeck(deckSnap), cards, reviews }, null, 2);
}

function parseJsonField<T>(value: unknown): T | undefined {
  if (typeof value !== 'string') return value as T | undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

interface ImportJsonCard {
  id?: string | number;
  front?: string;
  back?: string;
  tag?: string;
  cardType?: 'basic' | 'cloze';
  imagePath?: string;
  codeSnippet?: string | { code: string; language: string };
  topology?: string | NetworkTopology;
  bookmarked?: boolean | number;
  reps?: number;
  interval?: number;
  interval_days?: number;
  easeFactor?: number;
  ease_factor?: number;
  dueDate?: string;
  due_date?: string;
  lastReviewedAt?: string;
}

interface ImportJsonReview {
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

interface ImportJsonDeck {
  deck?: { name?: string; description?: string; studyMaterial?: string };
  cards?: ImportJsonCard[];
  reviews?: ImportJsonReview[];
}

export async function importDeckFromJson(json: string): Promise<void> {
  const data = JSON.parse(json) as ImportJsonDeck;
  const deck = await createDeck(
    (data.deck?.name ?? 'Imported deck') + ' (imported)',
    data.deck?.description ?? ''
  );
  if (data.deck?.studyMaterial) {
    await updateDeckStudyMaterial(deck.id, data.deck.studyMaterial);
  }

  const oldToNew = new Map<string, string>();
  for (const c of data.cards ?? []) {
    if (!c || (c.front === undefined && c.back === undefined)) continue;
    const created = await createCard({
      deckId: deck.id,
      front: c.front ?? '',
      back: c.back ?? '',
      tag: c.tag ?? '',
      cardType: c.cardType ?? 'basic',
      imagePath: c.imagePath,
      codeSnippet: parseJsonField<{ code: string; language: string }>(c.codeSnippet),
      topology: parseJsonField<Card['topology']>(c.topology),
    });
    oldToNew.set(String(c.id), created.id);
    const fields: Partial<Card> = {
      bookmarked: c.bookmarked === true || c.bookmarked === 1,
      reps: c.reps ?? 0,
      interval: c.interval ?? c.interval_days ?? 0,
      easeFactor: c.easeFactor ?? c.ease_factor ?? 2.5,
      dueDate: c.dueDate ?? c.due_date ?? todayStr(),
      lastReviewedAt: c.lastReviewedAt ?? undefined,
    };
    await updateCard(created.id, fields);
  }

  for (const r of data.reviews ?? []) {
    const newCardId = oldToNew.get(String(r.cardId ?? r.card_id));
    if (!newCardId || r.rating == null) continue;
    await addReviewHistory({
      cardId: newCardId,
      rating: r.rating,
      timestamp: r.timestamp ?? r.reviewed_at ?? nowIso(),
      previousInterval: r.previousInterval ?? r.prev_interval ?? 0,
      nextInterval: r.nextInterval ?? r.new_interval ?? 0,
      previousEaseFactor: r.previousEaseFactor ?? r.prev_ease ?? 2.5,
      nextEaseFactor: r.nextEaseFactor ?? r.new_ease ?? 2.5,
    });
  }
}

export async function getSetting(key: string): Promise<string | null> {
  const snap = await getDoc(doc(cols(uid()).settings, key));
  if (!snap.exists()) return null;
  const value = snap.data().value;
  return typeof value === 'string' ? value : value == null ? null : JSON.stringify(value);
}

export async function setSetting(key: string, value: string): Promise<void> {
  await setDoc(doc(cols(uid()).settings, key), { value, updatedAt: nowIso() });
}

export async function getAllSettings(): Promise<Array<{ key: string; value: string }>> {
  const snap = await getDocs(query(cols(uid()).settings));
  return snap.docs.map((d) => ({ key: d.id, value: d.data().value ?? '' }));
}

export async function clearAllUserData(): Promise<void> {
  const c = cols(uid());
  const collections: CollectionReference<unknown>[] = [c.reviews, c.cards, c.decks];
  for (const colRef of collections) {
    const snap = await getDocs(colRef);
    await deleteDocsInBatches(colRef, snap.docs.map((d) => d.id));
  }
}

export function subscribeToUserData(
  userUid: string,
  onChange: () => void
): Unsubscribe {
  const c = cols(userUid);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const handler = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, 500);
  };
  const colRefs: Query<unknown>[] = [c.decks, c.cards, c.reviews];
  const unsubs = colRefs.map((colRef) => onSnapshot(colRef, handler));
  return () => {
    unsubs.forEach((u) => u());
    if (timer) clearTimeout(timer);
  };
}

export interface AiSession {
  id: string;
  sessionType: 'clean' | 'generate';
  inputText: string;
  outputText?: string;
  cardsJson?: string;
  deckId?: string;
  deckName?: string;
  cardCount: number;
  createdAt: string;
}

export async function saveAiSession(session: {
  sessionType: 'clean' | 'generate';
  inputText: string;
  outputText?: string;
  cardsJson?: string;
  deckId?: string;
  deckName?: string;
  cardCount?: number;
}): Promise<AiSession> {
  const c = cols(uid());
  const ref = doc(c.aiSessions);
  const full: AiSession = {
    id: ref.id,
    sessionType: session.sessionType,
    inputText: session.inputText,
    outputText: session.outputText,
    cardsJson: session.cardsJson,
    deckId: session.deckId,
    deckName: session.deckName,
    cardCount: session.cardCount ?? 0,
    createdAt: nowIso(),
  };
  // Optional fields (outputText/cardsJson/deckId/deckName) may be undefined;
    // Firestore rejects undefined field values, so strip them before writing.
    await setDoc(ref, serialize(full));
  return full;
}

export async function listAiSessions(): Promise<AiSession[]> {
  const snap = await getDocs(query(cols(uid()).aiSessions));
  return sortByDesc(
    snap.docs.map((d) => ({ ...d.data(), id: d.id })),
    (s) => s.createdAt
  ).slice(0, 100);
}

export async function deleteAiSession(sessionId: string): Promise<void> {
  await deleteDoc(doc(cols(uid()).aiSessions, sessionId));
}