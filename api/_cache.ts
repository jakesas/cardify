import { Redis } from '@upstash/redis';
import { createHash } from 'node:crypto';

// Lazy-init Redis client (survives cold starts in serverless)
let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    redis = new Redis({ url, token });
    return redis;
  }
  return null;
}

const PREFIX = 'fc:';
const IDX_PREFIX = 'idx:';
const TTL = 86400 * 30; // 30 days — study material doesn't change

// ── Hashing ────────────────────────────────────────────

/** Normalize text to a canonical form for exact matching */
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

/** Extract meaningful keywords from study text for fuzzy matching */
export function extractKeywords(text: string): string[] {
  const words = new Set<string>();

  // Acronyms: all-caps 2-8 chars (OSPF, VLAN, STP, TCP/IP)
  const acronyms = text.match(/\b[A-Z][A-Z0-9&/]{1,7}\b/g);
  if (acronyms) acronyms.forEach(w => words.add(w.toLowerCase()));

  // Numbered concepts: "Layer 2", "802.1Q", "192.168.1.0/24"
  const numbered = text.match(/\b[A-Za-z]+\s*\d+[\.\d\/]*\b/g);
  if (numbered) numbered.forEach(w => words.add(w.toLowerCase()));

  // Capitalized phrases (technical terms): "Spanning Tree Protocol"
  const caps = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g);
  if (caps) caps.forEach(w => words.add(w.toLowerCase()));

  // Protocol/technology names with special chars: "EIGRP", "OSPFv3"
  const tech = text.match(/\b[A-Za-z]+\d*[A-Za-z]*v?\d+\b/g);
  if (tech) tech.forEach(w => words.add(w.toLowerCase()));

  return Array.from(words).slice(0, 20); // max 20 keywords per text
}

// ── Cache operations ───────────────────────────────────

interface CacheEntry {
  data: any;            // full Groq response JSON
  keywords: string[];   // extracted keywords for this entry
  generatedAt: number;  // timestamp
  accessCount: number;  // how many times served from cache
  hits: number;         // how many times this was matched via keywords
}

/** Check if we have cached flashcards for this text hash */
export async function getCachedByHash(hash: string): Promise<{ data: any } | null> {
  const r = getRedis();
  if (!r) return null;

  const entry = await r.get<CacheEntry>(`${PREFIX}${hash}`);
  if (!entry) return null;

  // Increment access count (fire-and-forget)
  r.incr(`${PREFIX}${hash}`, 'accessCount').catch(() => {});

  return { data: entry.data };
}

/** Try to find semantically similar content via keyword overlap */
export async function getCachedByKeywords(keywords: string[]): Promise<{ data: any; hash: string } | null> {
  const r = getRedis();
  if (!r || keywords.length === 0) return null;

  // Score each cached entry by keyword overlap
  const scores = new Map<string, number>();

  for (const kw of keywords) {
    const hashes = await r.smembers<string[]>(`${IDX_PREFIX}${kw}`);
    for (const h of hashes) {
      scores.set(h, (scores.get(h) || 0) + 1);
    }
  }

  if (scores.size === 0) return null;

  // Find the best match with at least 60% keyword overlap
  const best = Array.from(scores.entries())
    .map(([hash, score]) => ({ hash, score, ratio: score / keywords.length }))
    .filter(e => e.ratio >= 0.4)
    .sort((a, b) => b.ratio - a.ratio)[0];

  if (!best) return null;

  const entry = await r.get<CacheEntry>(`${PREFIX}${best.hash}`);
  if (!entry) return null;

  // Increment hit counter
  r.incr(`${PREFIX}${best.hash}`, 'hits').catch(() => {});

  return { data: entry.data, hash: best.hash };
}

/** Store generated flashcards in the cache */
export async function setCachedCards(hash: string, data: any, keywords: string[]): Promise<void> {
  const r = getRedis();
  if (!r) return;

  const entry: CacheEntry = {
    data,
    keywords,
    generatedAt: Date.now(),
    accessCount: 1,
    hits: 0,
  };

  // Store the entry
  await r.set(`${PREFIX}${hash}`, entry, { ex: TTL });

  // Index each keyword → hash
  const pipeline = r.pipeline();
  for (const kw of keywords) {
    pipeline.sadd(`${IDX_PREFIX}${kw}`, hash);
    pipeline.expire(`${IDX_PREFIX}${kw}`, TTL);
  }
  await pipeline.exec();
}
