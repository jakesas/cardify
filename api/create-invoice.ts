import type { IncomingMessage, ServerResponse } from 'node:http';
import { createVerify } from 'node:crypto';

const XENDIT_API = 'https://api.xendit.co/v2/invoices';

function b64urlDecode(s: string): string {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

// ── Rate limiting (via Upstash Redis) ─────────────────

const RL_PREFIX_INV = 'rl:inv:';
const RL_WINDOW_INV = 60;   // seconds
const RL_MAX_INV = 5;       // invoice requests per window

async function checkRateLimit(uid: string): Promise<
  { ok: true; remaining: number } | { ok: false; retryAfter: number }
> {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!base || !token) return { ok: true, remaining: Infinity };

  const key = `${RL_PREFIX_INV}${uid}`;
  const headers = { Authorization: `Bearer ${token}` };

  try {
    const res = await fetch(`${base}/incr/${key}`, { method: 'POST', headers });
    if (!res.ok) return { ok: true, remaining: Infinity };
    const { result: count } = await res.json() as { result: number };

    if (count === 1) {
      fetch(`${base}/expire/${key}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(RL_WINDOW_INV),
      }).catch(() => {});
    }

    if (count > RL_MAX_INV) {
      const ttlRes = await fetch(`${base}/ttl/${key}`, { headers });
      const { result: ttl } = await ttlRes.json() as { result: number };
      return { ok: false, retryAfter: Math.max(1, ttl ?? RL_WINDOW_INV) };
    }

    return { ok: true, remaining: RL_MAX_INV - count };
  } catch {
    return { ok: true, remaining: Infinity };
  }
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

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowSec) return null;
  if (payload.iat && payload.iat > nowSec + 300) return null;
  if (payload.aud !== FIREBASE_PROJECT_ID) return null;
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) return null;
  if (!payload.uid && !payload.sub) return null;

  if (!header.kid) return null;
  const cert = await getCert(header.kid);
  if (!cert) return null;

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  if (!verifier.verify(cert, signature)) return null;

  return { uid: payload.uid || payload.sub };
}

// ── Helpers ────────────────────────────────────────────

const ALLOWED_ORIGIN = 'https://cardify.vercel.app';

function json(res: ServerResponse, code: number, data: object) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

// ── Handler ────────────────────────────────────────────

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') return void json(res, 405, { error: 'Method not allowed' });

    const decoded = await verifyToken(req.headers.authorization);
    if (!decoded) return void json(res, 401, { error: 'Unauthorized' });

    const rl = await checkRateLimit(decoded.uid);
    if (!rl.ok) {
      res.setHeader('Retry-After', String(rl.retryAfter));
      return void json(res, 429, { error: 'Too many requests. Please try again later.', retryAfter: rl.retryAfter });
    }

    const secretKey = process.env.XENDIT_SECRET_KEY;
    if (!secretKey) return void json(res, 500, { error: 'Xendit secret key not configured' });

    const buffers: Buffer[] = [];
    for await (const chunk of req) buffers.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(buffers).toString('utf-8'));
    const { userId, email, amount, description, redirectUrl } = body;

    if (!userId || !email || !amount) return void json(res, 400, { error: 'Missing required fields' });
    if (decoded.uid !== userId) return void json(res, 403, { error: 'User mismatch' });

    // Validate redirect URL to prevent open redirect attacks
    if (redirectUrl && !redirectUrl.startsWith(ALLOWED_ORIGIN)) {
      return void json(res, 400, { error: 'Invalid redirect URL' });
    }

    const xenditRes = await fetch(XENDIT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      },
      body: JSON.stringify({
        external_id: `flashpoint-${userId}-${Date.now()}`,
        amount,
        payer_email: email,
        description: description || 'Flashpoint Premium - Lifetime Access',
        currency: 'PHP',
        success_redirect_url: redirectUrl || '',
        failure_redirect_url: redirectUrl || '',
      }),
    });

    const data = await xenditRes.json();
    if (!xenditRes.ok) return void json(res, xenditRes.status, { error: data.message || 'Xendit API error' });

    json(res, 200, { invoiceUrl: data.invoice_url, id: data.id, status: data.status });
  } catch (err: any) {
    json(res, 500, { error: err?.message || 'Internal error' });
  }
}