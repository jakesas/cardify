-- Store history of AI sessions (OCR cleans + flashcard generations)
CREATE TABLE IF NOT EXISTS ai_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_type TEXT NOT NULL CHECK(session_type IN ('clean', 'generate')),
  input_text TEXT NOT NULL,
  output_text TEXT,
  cards_json TEXT,
  deck_id INTEGER REFERENCES decks(id) ON DELETE SET NULL,
  deck_name TEXT,
  card_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_created ON ai_sessions(created_at DESC);
