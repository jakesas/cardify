import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyAuth } from './_auth';

const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY ?? '';
const XENDIT_API = 'https://api.xendit.co/v2/invoices';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let decoded;
  try {
    decoded = await verifyAuth(req.headers.authorization);
  } catch {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  if (!XENDIT_SECRET_KEY) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Xendit secret key not configured' }));
    return;
  }

  // Read request body
  const buffers: Buffer[] = [];
  for await (const chunk of req) {
    buffers.push(Buffer.from(chunk));
  }
  const body = JSON.parse(Buffer.concat(buffers).toString('utf-8'));
  const { userId, email, amount, description } = body;

  if (!userId || !email || !amount) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing required fields: userId, email, amount' }));
    return;
  }

  if (decoded.uid !== userId) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Forbidden: userId does not match authenticated user' }));
    return;
  }

  try {
    const xenditRes = await fetch(XENDIT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${XENDIT_SECRET_KEY}:`).toString('base64')}`,
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

    if (!xenditRes.ok) {
      res.statusCode = xenditRes.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: data.message || 'Xendit API error' }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      invoiceUrl: data.invoice_url,
      id: data.id,
      status: data.status,
    }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }));
  }
}
