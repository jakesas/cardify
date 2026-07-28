import type { VercelRequest, VercelResponse } from '@vercel/node';

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow the methods Groq SDK uses
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY not configured on server' });
  }

  // Reconstruct the path from the catch-all slug
  const slug = ((req.query.slug as string[]) ?? []).join('/');
  const url = `${GROQ_API_BASE}/${slug}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };

  // Forward Content-Type only when there's a body
  let body: string | undefined;
  if (req.method === 'POST') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(req.body);
  }

  let groqRes: Response;
  try {
    groqRes = await fetch(url, {
      method: req.method,
      headers,
      body,
    });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Groq API', detail: String(err) });
  }

  // Forward the status code
  res.status(groqRes.status);

  // Check if the response is streaming (SSE)
  const isStream =
    req.body?.stream === true &&
    groqRes.headers.get('content-type')?.includes('text/event-stream');

  if (isStream && groqRes.body) {
    // Pipe the SSE stream directly to the client
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

  // Non-streaming: forward the JSON body as-is
  try {
    const data = await groqRes.json();
    return res.json(data);
  } catch {
    return res.status(groqRes.status).json({ error: 'Unexpected response from Groq API' });
  }
}
