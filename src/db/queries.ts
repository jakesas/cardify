import { getDb } from './client';
import { Deck, Card, ReviewHistory } from '../types';
import { calculateSM2, getLocalDateString } from '../utils/sm2';

function mapRowToDeck(row: any): Deck {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description,
    studyMaterial: row.study_material,
    createdAt: row.created_at,
  };
}

export async function listDecks(): Promise<Deck[]> {
  const db = await getDb();
  const rows = await db.select<any[]>('SELECT * FROM decks ORDER BY created_at DESC');
  return rows.map(mapRowToDeck);
}

export async function createDeck(name: string, description?: string): Promise<Deck> {
  const db = await getDb();
  const result = await db.select<any[]>(
    'INSERT INTO decks (name, description, created_at) VALUES (?, ?, datetime(\'now\')) RETURNING *',
    [name, description ?? null]
  );
  return mapRowToDeck(result[0]);
}

export async function updateDeckStudyMaterial(deckId: string, material: string): Promise<Deck> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    'UPDATE decks SET study_material = ? WHERE id = ? RETURNING *',
    [material, Number(deckId)]
  );
  return mapRowToDeck(rows[0]);
}

export async function deleteDeck(deckId: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM decks WHERE id = ?', [Number(deckId)]);
}

export async function getDueCards(deckId: string, limit?: number): Promise<Card[]> {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  let query = 'SELECT * FROM cards WHERE deck_id = ? AND due_date <= ? ORDER BY due_date ASC';
  const params: any[] = [Number(deckId), today];
  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }
  const rows = await db.select<any[]>(query, params);
  return rows.map(mapRowToCard);
}

export async function getAllCards(): Promise<Card[]> {
  const db = await getDb();
  const rows = await db.select<any[]>('SELECT * FROM cards ORDER BY created_at DESC');
  return rows.map(mapRowToCard);
}

export async function createCard(input: {
  deckId: string;
  front: string;
  back: string;
  cardType?: 'basic' | 'cloze';
  tag: string;
  imagePath?: string;
  codeSnippet?: { code: string; language: string };
  topology?: any;
}): Promise<Card> {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  const rows = await db.select<any[]>(
    `INSERT INTO cards (deck_id, card_type, front, back, tag, image_path, code_snippet, topology, ease_factor, interval_days, reps, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 2.5, 0, 0, ?, datetime('now'), datetime('now'))
     RETURNING *`,
    [
      Number(input.deckId),
      input.cardType ?? 'basic',
      input.front,
      input.back,
      input.tag,
      input.imagePath ?? null,
      input.codeSnippet ? JSON.stringify(input.codeSnippet) : null,
      input.topology ? JSON.stringify(input.topology) : null,
      today,
    ]
  );
  return mapRowToCard(rows[0]);
}

function buildCardSetClauses(fields: Partial<Card>, params: any[]): string[] {
  const setParts: string[] = [];
  if (fields.front !== undefined) { setParts.push('front = ?'); params.push(fields.front); }
  if (fields.back !== undefined) { setParts.push('back = ?'); params.push(fields.back); }
  if (fields.tag !== undefined) { setParts.push('tag = ?'); params.push(fields.tag); }
  if (fields.deckId !== undefined) { setParts.push('deck_id = ?'); params.push(Number(fields.deckId)); }
  if (fields.imagePath !== undefined) { setParts.push('image_path = ?'); params.push(fields.imagePath); }
  if (fields.codeSnippet !== undefined) { setParts.push('code_snippet = ?'); params.push(fields.codeSnippet ? JSON.stringify(fields.codeSnippet) : null); }
  if (fields.topology !== undefined) { setParts.push('topology = ?'); params.push(fields.topology ? JSON.stringify(fields.topology) : null); }
  return setParts;
}

export async function updateCard(cardId: string, fields: Partial<Card>): Promise<Card> {
  const db = await getDb();
  const params: any[] = [];
  const setParts = buildCardSetClauses(fields, params);
  if (setParts.length === 0) throw new Error('No fields to update');

  setParts.push('updated_at = datetime(\'now\')');
  params.push(Number(cardId));

  const rows = await db.select<any[]>(
    `UPDATE cards SET ${setParts.join(', ')} WHERE id = ? RETURNING *`,
    params
  );
  return mapRowToCard(rows[0]);
}

export async function updateCards(ids: string[], fields: Partial<Card>): Promise<Card[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const params: any[] = [];
  const setParts = buildCardSetClauses(fields, params);
  if (setParts.length === 0) throw new Error('No fields to update');

  setParts.push('updated_at = datetime(\'now\')');
  const placeholders = ids.map(() => '?').join(', ');
  ids.forEach(id => params.push(Number(id)));

  const rows = await db.select<any[]>(
    `UPDATE cards SET ${setParts.join(', ')} WHERE id IN (${placeholders}) RETURNING *`,
    params
  );
  return rows.map(mapRowToCard);
}

export async function deleteCard(cardId: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM cards WHERE id = ?', [Number(cardId)]);
}

export async function deleteCards(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(', ');
  await db.execute(`DELETE FROM cards WHERE id IN (${placeholders})`, ids.map(Number));
}

export async function submitReview(cardId: string, rating: 1 | 2 | 3 | 4): Promise<Card> {
  const db = await getDb();
  
  // 1. Fetch current card
  const cardRows = await db.select<any[]>('SELECT * FROM cards WHERE id = ?', [Number(cardId)]);
  if (cardRows.length === 0) throw new Error('Card not found');
  const card = mapRowToCard(cardRows[0]);
  
  // 2. Calculate new schedule using SM-2
  const { reps, interval, easeFactor } = calculateSM2(rating, card.reps, card.interval, card.easeFactor);
  const dueDate = getLocalDateString(interval);
  const now = new Date().toISOString();
  
  // 3. Update card
  await db.execute(
    `UPDATE cards SET reps = ?, interval_days = ?, ease_factor = ?, due_date = ?, last_reviewed_at = ?, updated_at = datetime('now') WHERE id = ?`,
    [reps, interval, easeFactor, dueDate, now, Number(cardId)]
  );
  
  // 4. Insert review log
  await db.execute(
    `INSERT INTO reviews (card_id, rating, reviewed_at, prev_interval, new_interval, prev_ease, new_ease)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [Number(cardId), rating, now, card.interval, interval, card.easeFactor, easeFactor]
  );
  
  // 5. Return updated card
  const updatedRows = await db.select<any[]>('SELECT * FROM cards WHERE id = ?', [Number(cardId)]);
  return mapRowToCard(updatedRows[0]);
}

export async function getReviewHistory(cardId: string): Promise<ReviewHistory[]> {
  const db = await getDb();
  const rows = await db.select<any[]>('SELECT * FROM reviews WHERE card_id = ? ORDER BY reviewed_at DESC', [Number(cardId)]);
  return rows.map(mapRowToReviewHistory);
}

export async function getAllReviews(): Promise<ReviewHistory[]> {
  const db = await getDb();
  const rows = await db.select<any[]>('SELECT * FROM reviews ORDER BY reviewed_at DESC');
  return rows.map(mapRowToReviewHistory);
}

export async function exportDeckToJson(deckId: string): Promise<string> {
  const db = await getDb();
  const deck = await db.select<any[]>('SELECT * FROM decks WHERE id = ?', [Number(deckId)]);
  const cards = await db.select<any[]>('SELECT * FROM cards WHERE deck_id = ?', [Number(deckId)]);
  const reviews = await db.select<any[]>('SELECT r.* FROM reviews r JOIN cards c ON r.card_id = c.id WHERE c.deck_id = ?', [Number(deckId)]);
  
  return JSON.stringify({ deck: deck[0], cards, reviews }, null, 2);
}

export async function importDeckFromJson(json: string): Promise<void> {
  const db = await getDb();
  const data = JSON.parse(json);
  
  // Create deck
  const deckRows = await db.select<any[]>(
    'INSERT INTO decks (name, description, created_at) VALUES (?, ?, ?) RETURNING id',
    [data.deck.name + ' (imported)', data.deck.description, new Date().toISOString()]
  );
  const newDeckId = deckRows[0].id;
  
  // Import cards
  for (const card of data.cards) {
    await db.execute(
      `INSERT INTO cards (deck_id, card_type, front, back, tag, image_path, code_snippet, topology, ease_factor, interval_days, reps, due_date, last_reviewed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        newDeckId,
        card.card_type ?? 'basic',
        card.front,
        card.back,
        card.tag,
        card.image_path,
        card.code_snippet ? JSON.stringify(card.code_snippet) : null,
        card.topology ? JSON.stringify(card.topology) : null,
        card.ease_factor ?? 2.5,
        card.interval_days ?? 0,
        card.reps ?? 0,
        card.due_date,
        card.last_reviewed_at,
      ]
    );
  }
  
  // Import reviews
  for (const review of data.reviews) {
    await db.execute(
      `INSERT INTO reviews (card_id, rating, reviewed_at, prev_interval, new_interval, prev_ease, new_ease)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [review.card_id, review.rating, review.timestamp, review.previousInterval, review.nextInterval, review.previousEaseFactor, review.nextEaseFactor]
    );
  }
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{value: string}[]>('SELECT value FROM settings WHERE key = ?', [key]);
  return rows.length > 0 ? rows[0].value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

// ─── AI Session History ───────────────────────────────────────────────────────

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

function mapRowToAiSession(row: any): AiSession {
  return {
    id: String(row.id),
    sessionType: row.session_type,
    inputText: row.input_text,
    outputText: row.output_text ?? undefined,
    cardsJson: row.cards_json ?? undefined,
    deckId: row.deck_id ? String(row.deck_id) : undefined,
    deckName: row.deck_name ?? undefined,
    cardCount: row.card_count ?? 0,
    createdAt: row.created_at,
  };
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
  const db = await getDb();
  const rows = await db.select<any[]>(
    `INSERT INTO ai_sessions (session_type, input_text, output_text, cards_json, deck_id, deck_name, card_count)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    [
      session.sessionType,
      session.inputText,
      session.outputText ?? null,
      session.cardsJson ?? null,
      session.deckId ? Number(session.deckId) : null,
      session.deckName ?? null,
      session.cardCount ?? 0,
    ]
  );
  return mapRowToAiSession(rows[0]);
}

export async function listAiSessions(): Promise<AiSession[]> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    'SELECT * FROM ai_sessions ORDER BY created_at DESC LIMIT 100'
  );
  return rows.map(mapRowToAiSession);
}

export async function deleteAiSession(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM ai_sessions WHERE id = ?', [Number(sessionId)]);
}

function mapRowToCard(row: any): Card {
  return {
    id: String(row.id),
    deckId: String(row.deck_id),
    cardType: row.card_type,
    front: row.front,
    back: row.back,
    tag: row.tag,
    imagePath: row.image_path,
    codeSnippet: row.code_snippet ? JSON.parse(row.code_snippet) : undefined,
    topology: row.topology ? JSON.parse(row.topology) : undefined,
    reps: row.reps ?? row.repetitions ?? 0,
    interval: row.interval_days,
    easeFactor: row.ease_factor,
    dueDate: row.due_date,
    lastReviewedAt: row.last_reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToReviewHistory(row: any): ReviewHistory {
  return {
    id: String(row.id),
    cardId: String(row.card_id),
    rating: row.rating,
    timestamp: row.reviewed_at,
    previousInterval: row.prev_interval,
    nextInterval: row.new_interval,
    previousEaseFactor: row.prev_ease,
    nextEaseFactor: row.new_ease,
  };
}