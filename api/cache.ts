import { createHash } from 'node:crypto';

const PREFIX = 'fc:';
const IDX_PREFIX = 'idx:';
const TTL = 86400 * 30; // 30 days

interface UpstashResult<T> {
  result: T | null;
  error: string | null;
}

function upstashUrl(path: string): string | null {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!base || !token) return null;
  return `${base}/${path.startsWith('/') ? path.slice(1) : path}`;
}

function upstashHeaders(): Record<string, string> | null {
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

async function upstashGet<T>(path: string): Promise<T | null> {
  const url = upstashUrl(path);
  const headers = upstashHeaders();
  if (!url || !headers) return null;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const json: UpstashResult<T> = await res.json();
    return json.error ? null : (json.result ?? null);
  } catch {
    return null;
  }
}

async function upstashSet(path: string, value: unknown): Promise<boolean> {
  const url = upstashUrl(path);
  const headers = upstashHeaders();
  if (!url || !headers) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', TTL: String(TTL) },
      body: JSON.stringify(value),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function upstashCommand(path: string, body?: unknown): Promise<boolean> {
  const url = upstashUrl(path);
  const headers = upstashHeaders();
  if (!url || !headers) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Hashing ────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function hashText(text: string): string {
  return createHash('sha256').update(normalize(text)).digest('hex');
}

// ── Keyword extraction ─────────────────────────────────

export function extractKeywords(text: string): string[] {
  const words = new Set<string>();

  const acronyms = text.match(/\b[A-Z][A-Z0-9&/]{1,7}\b/g);
  if (acronyms) acronyms.forEach(w => words.add(w.toLowerCase()));

  const numbered = text.match(/\b[A-Za-z]+\s*\d+[\.\d\/]*\b/g);
  if (numbered) numbered.forEach(w => words.add(w.toLowerCase()));

  const caps = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g);
  if (caps) caps.forEach(w => words.add(w.toLowerCase()));

  const tech = text.match(/\b[A-Za-z]+\d*[A-Za-z]*v?\d+\b/g);
  if (tech) tech.forEach(w => words.add(w.toLowerCase()));

  return Array.from(words).slice(0, 20);
}

// ── Cache operations ───────────────────────────────────

interface CacheEntry {
  data: any;
  keywords: string[];
  generatedAt: number;
}

export async function getCachedByHash(hash: string): Promise<{ data: any } | null> {
  const entry = await upstashGet<CacheEntry>(`get/${PREFIX}${hash}`);
  if (!entry) return null;
  return { data: entry.data };
}

export async function getCachedByKeywords(keywords: string[]): Promise<{ data: any; hash: string } | null> {
  if (keywords.length === 0) return null;

  const scores = new Map<string, number>();

  for (const kw of keywords) {
    const hashes = await upstashGet<string[]>(`smembers/${IDX_PREFIX}${kw}`);
    if (!hashes) continue;
    for (const h of hashes) {
      scores.set(h, (scores.get(h) || 0) + 1);
    }
  }

  if (scores.size === 0) return null;

  const best = Array.from(scores.entries())
    .map(([hash, score]) => ({ hash, score, ratio: score / keywords.length }))
    .filter(e => e.ratio >= 0.4)
    .sort((a, b) => b.ratio - a.ratio)[0];

  if (!best) return null;

  const entry = await upstashGet<CacheEntry>(`get/${PREFIX}${best.hash}`);
  if (!entry) return null;

  return { data: entry.data, hash: best.hash };
}

export async function setCachedCards(hash: string, data: any, keywords: string[]): Promise<void> {
  const entry: CacheEntry = {
    data,
    keywords,
    generatedAt: Date.now(),
  };

  await upstashSet(`set/${PREFIX}${hash}`, entry);

  for (const kw of keywords) {
    await upstashCommand(`sadd/${IDX_PREFIX}${kw}`, hash);
    await upstashCommand(`expire/${IDX_PREFIX}${kw}`, TTL);
  }
}
