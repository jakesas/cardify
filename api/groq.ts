import type { IncomingMessage, ServerResponse } from 'node:http';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') return void json(res, 405, { error: 'Method not allowed' });
    if (!verifyToken(req.headers.authorization)) return void json(res, 401, { error: 'Unauthorized' });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return void json(res, 500, { error: 'GROQ_API_KEY not configured' });

    const buffers: Buffer[] = [];
    for await (const chunk of req) buffers.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(buffers).toString('utf-8'));

    const groqRes = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!groqRes.ok) {
      const detail = await groqRes.text().catch(() => '');
      return void json(res, groqRes.status, { error: 'Groq API error', detail });
    }

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
    json(res, 200, data);
  } catch (err: any) {
    json(res, 500, { error: err?.message || 'Internal error' });
  }
}
