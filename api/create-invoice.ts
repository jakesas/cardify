import type { IncomingMessage, ServerResponse } from 'node:http';

const XENDIT_API = 'https://api.xendit.co/v2/invoices';

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

    const decoded = verifyToken(req.headers.authorization);
    if (!decoded) return void json(res, 401, { error: 'Unauthorized' });

    const secretKey = process.env.XENDIT_SECRET_KEY;
    if (!secretKey) return void json(res, 500, { error: 'Xendit secret key not configured' });

    const buffers: Buffer[] = [];
    for await (const chunk of req) buffers.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(buffers).toString('utf-8'));
    const { userId, email, amount, description } = body;

    if (!userId || !email || !amount) return void json(res, 400, { error: 'Missing required fields' });
    if (decoded.uid !== userId) return void json(res, 403, { error: 'User mismatch' });

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
        success_redirect_url: body.redirectUrl || '',
        failure_redirect_url: body.redirectUrl || '',
      }),
    });

    const data = await xenditRes.json();
    if (!xenditRes.ok) return void json(res, xenditRes.status, { error: data.message || 'Xendit API error' });

    json(res, 200, { invoiceUrl: data.invoice_url, id: data.id, status: data.status });
  } catch (err: any) {
    json(res, 500, { error: err?.message || 'Internal error' });
  }
}
