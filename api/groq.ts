import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, createVerify } from 'node:crypto';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_RETRIES = 5;
const MAX_DELAY_MS = 30_000;

// ── Redis cache (via Upstash REST API — raw fetch, no SDK) ────────────

const FC_PREFIX = 'fc:';
const IDX_PREFIX = 'idx:';
const CACHE_TTL = 86400 * 30; // 30 days

interface CacheEntry {
  data: any;
  keywords: string[];
  generatedAt: number;
}

function cacheUrl(path: string): string | null {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!base || !token) return null;
  return `${base}/${path}`;
}

function cacheAuth(): Record<string, string> | null {
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

async function cacheGet<T>(path: string): Promise<T | null> {
  const url = cacheUrl(path);
  const headers = cacheAuth();
  if (!url || !headers) return null;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const json = await res.json() as { result: T | null; error: string | null };
    return json.error ? null : (json.result ?? null);
  } catch {
    return null;
  }
}

async function cacheSet(path: string, value: unknown): Promise<boolean> {
  const url = cacheUrl(path);
  const headers = cacheAuth();
  if (!url || !headers) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', TTL: String(CACHE_TTL) },
      body: JSON.stringify(value),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function cacheCmd(path: string, body?: unknown): Promise<boolean> {
  const url = cacheUrl(path);
  const headers = cacheAuth();
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

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function hashText(text: string): string {
  return createHash('sha256').update(normalizeText(text)).digest('hex');
}

// ── Keyword extraction ─────────────────────────────────

function extractKeywords(text: string): string[] {
  const words = new Set<string>();
  const m1 = text.match(/\b[A-Z][A-Z0-9&/]{1,7}\b/g);
  if (m1) m1.forEach(w => words.add(w.toLowerCase()));
  const m2 = text.match(/\b[A-Za-z]+\s*\d+[\.\d\/]*\b/g);
  if (m2) m2.forEach(w => words.add(w.toLowerCase()));
  const m3 = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g);
  if (m3) m3.forEach(w => words.add(w.toLowerCase()));
  const m4 = text.match(/\b[A-Za-z]+\d*[A-Za-z]*v?\d+\b/g);
  if (m4) m4.forEach(w => words.add(w.toLowerCase()));
  return Array.from(words).slice(0, 20);
}

// ── Cache operations ───────────────────────────────────

async function getCachedByHash(hash: string): Promise<{ data: any } | null> {
  const entry = await cacheGet<CacheEntry>(`get/${FC_PREFIX}${hash}`);
  return entry ? { data: entry.data } : null;
}

async function getCachedByKeywords(keywords: string[]): Promise<{ data: any; hash: string } | null> {
  if (keywords.length === 0) return null;
  const scores = new Map<string, number>();
  for (const kw of keywords) {
    const hashes = await cacheGet<string[]>(`smembers/${IDX_PREFIX}${kw}`);
    if (!hashes) continue;
    for (const h of hashes) scores.set(h, (scores.get(h) || 0) + 1);
  }
  if (scores.size === 0) return null;
  const best = Array.from(scores.entries())
    .map(([h, s]) => ({ hash: h, score: s, ratio: s / keywords.length }))
    .filter(e => e.ratio >= 0.4)
    .sort((a, b) => b.ratio - a.ratio)[0];
  if (!best) return null;
  const entry = await cacheGet<CacheEntry>(`get/${FC_PREFIX}${best.hash}`);
  return entry ? { data: entry.data, hash: best.hash } : null;
}

async function setCachedCards(hash: string, data: any, keywords: string[]): Promise<void> {
  const entry: CacheEntry = { data, keywords, generatedAt: Date.now() };
  await cacheSet(`set/${FC_PREFIX}${hash}`, entry);
  for (const kw of keywords) {
    await cacheCmd(`sadd/${IDX_PREFIX}${kw}`, hash);
    await cacheCmd(`expire/${IDX_PREFIX}${kw}`, CACHE_TTL);
  }
}

// ── Helpers ────────────────────────────────────────────

function b64url(s: string): string {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf-8');
}

function b64urlDecode(s: string): string {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

// ── Firebase JWT verification (RS256) ──────────────────

const FIREBASE_PROJECT_ID = 'flashpoint-ccna';
const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let certCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getCert(kid: string): Promise<string | null> {
  const now = Date.now();
  if (!certCache || now > certCache.expiresAt) {
    const res = await fetch(CERT_URL);
    if (!res.ok) return null;
    const maxAge = parseInt(res.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || '3600', 10) * 1000;
    const certs = await res.json() as Record<string, string>;
    certCache = { certs, expiresAt: now + maxAge };
  }
  return certCache.certs[kid] || null;
}

async function verifyToken(auth: string | undefined): Promise<{ uid: string } | null> {
  if (!auth?.startsWith('Bearer ')) return null;
  const raw = auth.slice(7);
  const parts = raw.split('.');
  if (parts.length !== 3) return null;

  let header: any, payload: any, signature: Buffer;
  try {
    header = JSON.parse(b64urlDecode(parts[0]));
    payload = JSON.parse(b64urlDecode(parts[1]));
    signature = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  } catch { return null; }

  // Standard JWT validations (no network call)
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowSec) return null;
  if (payload.iat && payload.iat > nowSec + 300) return null;
  if (payload.aud !== FIREBASE_PROJECT_ID) return null;
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) return null;
  if (!payload.uid && !payload.sub) return null;

  // Signature verification (fetches Firebase public key via X.509 cert)
  if (!header.kid) return null;
  const cert = await getCert(header.kid);
  if (!cert) return null;

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  if (!verifier.verify(cert, signature)) return null;

  return { uid: payload.uid || payload.sub };
}

function json(res: ServerResponse, code: number, data: object) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function fetchWithRetry(url: string, opts: RequestInit, attempt = 1): Promise<Response> {
  const res = await fetch(url, opts);
  if (res.status === 429 && attempt <= MAX_RETRIES) {
    const raw = res.headers.get('retry-after');
    const secs = raw ? parseInt(raw, 10) : 0;
    const baseDelay = Math.min(2 ** attempt * 1000 + Math.random() * 1000, MAX_DELAY_MS);
    const delay = (!isNaN(secs) && secs > 0) ? Math.max(secs * 1000, baseDelay) : baseDelay;
    await new Promise(r => setTimeout(r, delay));
    return fetchWithRetry(url, opts, attempt + 1);
  }
  return res;
}

// ── Handler ────────────────────────────────────────────

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') return void json(res, 405, { error: 'Method not allowed' });
    if (!await verifyToken(req.headers.authorization)) return void json(res, 401, { error: 'Unauthorized' });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return void json(res, 500, { error: 'GROQ_API_KEY not configured' });

    const buffers: Buffer[] = [];
    for await (const chunk of req) buffers.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(buffers).toString('utf-8'));

    const msgs = body.messages ?? [];
    const userMsg = msgs.filter((m: any) => m.role === 'user').pop()?.content || '';
    const studyText = userMsg.replace(/^Generate flashcards from this study material:\s*\n*/i, '');
    let cacheHash: string | undefined;
    let cacheKeywords: string[] | undefined;

    if (studyText.length >= 20) {
      cacheHash = hashText(studyText);
      const exactHit = await getCachedByHash(cacheHash);
      if (exactHit) {
        res.setHeader('X-Cache', 'HIT');
        return void json(res, 200, exactHit.data);
      }
      cacheKeywords = extractKeywords(studyText);
      const fuzzyHit = await getCachedByKeywords(cacheKeywords);
      if (fuzzyHit) {
        res.setHeader('X-Cache', 'FUZZY');
        return void json(res, 200, fuzzyHit.data);
      }
    }

    const groqRes = await fetchWithRetry(GROQ_CHAT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!groqRes.ok) {
      const detail = await groqRes.text().catch(() => '');
      const remaining = groqRes.headers.get('x-ratelimit-remaining-requests');
      const remainingTokens = groqRes.headers.get('x-ratelimit-remaining-tokens');
      return void json(res, groqRes.status, {
        error: 'Groq API error',
        detail,
        rateLimitRemaining: remaining ? parseInt(remaining, 10) : undefined,
        rateLimitRemainingTokens: remainingTokens ? parseInt(remainingTokens, 10) : undefined,
      });
    }

    const remaining = groqRes.headers.get('x-ratelimit-remaining-requests');
    const remainingTokens = groqRes.headers.get('x-ratelimit-remaining-tokens');
    if (remaining) res.setHeader('X-RateLimit-Remaining', remaining);
    if (remainingTokens) res.setHeader('X-RateLimit-Remaining-Tokens', remainingTokens);

    if (body.stream === true && groqRes.body) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const reader = groqRes.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.end(); break; }
          res.write(decoder.decode(value, { stream: true }));
        }
      } catch { res.end(); }
      return;
    }

    const data = await groqRes.json();

    if (cacheHash && cacheKeywords && data?.choices?.[0]?.message?.content) {
      setCachedCards(cacheHash, data, cacheKeywords);
    }

    json(res, 200, data);
  } catch (err: any) {
    json(res, 500, { error: err?.message || 'Internal error' });
  }
}
