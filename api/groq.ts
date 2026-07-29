import type { IncomingMessage, ServerResponse } from 'node:http';
import { hashText, extractKeywords, getCachedByHash, getCachedByKeywords, setCachedCards } from './cache';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_RETRIES = 5;
const MAX_DELAY_MS = 30_000;

function b64url(s: string): string {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf-8');
}

function verifyToken(auth: string | undefined): { uid: string } | null {
  if (!auth?.startsWith('Bearer ')) return null;
  const parts = auth.slice(7).split('.');
  if (parts.length !== 3) return null;
  try {
    const p = JSON.parse(b64url(parts[1]));
    if (p.exp && p.exp < Math.floor(Date.now() / 1000)) return null;
    return { uid: p.uid || p.sub };
  } catch { return null; }
}

function json(res: ServerResponse, code: number, data: object) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function getRetryAfterMs(headers: Headers): number {
  const raw = headers.get('retry-after');
  if (!raw) return 0;
  const secs = parseInt(raw, 10);
  return isNaN(secs) ? 0 : secs * 1000;
}

async function fetchWithRetry(url: string, opts: RequestInit, attempt = 1): Promise<Response> {
  const res = await fetch(url, opts);

  if (res.status === 429 && attempt <= MAX_RETRIES) {
    const retryAfter = getRetryAfterMs(res.headers);
    const baseDelay = Math.min(2 ** attempt * 1000 + Math.random() * 1000, MAX_DELAY_MS);
    const delay = retryAfter > 0 ? Math.max(retryAfter, baseDelay) : baseDelay;
    await new Promise(r => setTimeout(r, delay));
    return fetchWithRetry(url, opts, attempt + 1);
  }

  return res;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') return void json(res, 405, { error: 'Method not allowed' });
    if (!verifyToken(req.headers.authorization)) return void json(res, 401, { error: 'Unauthorized' });

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
      setCachedCards(cacheHash, data, cacheKeywords).catch(() => {});
    }

    json(res, 200, data);
  } catch (err: any) {
    json(res, 500, { error: err?.message || 'Internal error' });
  }
}
