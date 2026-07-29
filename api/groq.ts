import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from './_auth';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let decoded;
  try {
    decoded = await verifyAuth(req.headers.authorization);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Auth configuration error' });
  }
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY not configured on server' });
  }

  // Verify we have a body to forward
  if (!req.body) {
    return res.status(400).json({ error: 'Request body is required' });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  let groqRes: Response;
  try {
    groqRes = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
    });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Groq API', detail: String(err) });
  }

  // Forward the status code for non-2xx responses
  if (!groqRes.ok) {
    const errorBody = await groqRes.text().catch(() => 'Failed to read Groq error body');
    return res.status(groqRes.status).json({
      error: 'Groq API error',
      status: groqRes.status,
      detail: errorBody,
    });
  }

  // Streaming: pipe SSE directly to client
  const isStream = req.body?.stream === true;
  if (isStream && groqRes.body) {
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
    } catch {
      res.end();
    }
    return;
  }

  // Non-streaming: forward JSON body
  try {
    const data = await groqRes.json();
    return res.status(200).json(data);
  } catch {
    return res.status(502).json({ error: 'Unexpected response from Groq API' });
  }
}
