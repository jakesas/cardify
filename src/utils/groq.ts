import Groq from 'groq-sdk';
import { getAuth } from 'firebase/auth';

async function getAuthToken(): Promise<string | null> {
  try {
    const auth = getAuth();
    const user = auth.currentUser;
    return user ? await user.getIdToken() : null;
  } catch {
    return null;
  }
}

export interface GeneratedCard {
  front: string;
  back: string;
  tag: string;
  codeSnippet?: { code: string; language: string };
}

export interface GenerationResult {
  cards: GeneratedCard[];
  title?: string;
}

export interface GenerationResponse extends GenerationResult {
  /** Rate-limit headers from the API response (browser context — may be undefined) */
  rateLimitRemaining?: number;
  rateLimitResetMs?: number;
  /** Estimated total tokens this call consumed (input + output) */
  estimatedTokensUsed: number;
}

const _proxyCheck = () => import.meta.env.PROD && !import.meta.env.VITE_GROQ_API_KEY;
/**
 * True when running in production with no VITE_GROQ_API_KEY — AI uses raw
 * fetch to /api/groq instead of the Groq SDK, keeping the real key server-side.
 */
export const IS_PROXY = _proxyCheck();

export function createGroqClient(apiKey: string, baseUrl?: string): Groq {
  return new Groq({
    apiKey,
    ...(baseUrl ? { baseURL: baseUrl } : {}),
    dangerouslyAllowBrowser: true,
    timeout: 600000, // 10 minutes — each card takes ~10s, 30 cards = 5min, with buffer
  });
}

/**
 * Returns the correct AI config based on the runtime environment.
 *
 * - **Development** (`VITE_GROQ_API_KEY` set) → direct Groq SDK with the env key.
 * - **Production** (no env key, deployed to Vercel) → proxy through /api/groq
 *   so the real key stays server-side inside the serverless function.
 * - **Neither** → returns `null` (AI features disabled).
 */
export function getAiConfig(): { apiKey: string; baseUrl?: string } | null {
  const envKey = import.meta.env.VITE_GROQ_API_KEY || '';
  if (envKey) return { apiKey: envKey };
  if (import.meta.env.PROD) {
    return { apiKey: 'placeholder' };
  }
  return null;
}



async function proxyFetch(path: string, body: object): Promise<Response> {
  const token = await getAuthToken();
  return fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function proxyRequest(body: object, attempt = 1): Promise<any> {
  const response = await proxyFetch('/api/groq', body);

  if (!response.ok) {
    const errText = await response.text().catch(() => '(no body)');
    if (response.status === 429 && attempt <= 3) {
      const delay = Math.min(2 ** attempt * 1000 + Math.random() * 1000, 15000);
      await new Promise(r => setTimeout(r, delay));
      return proxyRequest(body, attempt + 1);
    }
    throw new Error(`${response.status} ${errText}`);
  }

  const text = await response.text();
  if (!text) {
    const ct = response.headers.get('content-type') || 'none';
    const cl = response.headers.get('content-length') || 'none';
    throw new Error(`AI service returned an empty response (HTTP ${response.status}, Content-Type: ${ct}, Content-Length: ${cl}). Try again in a moment.`);
  }
  try { return JSON.parse(text); } catch {
    throw new Error(`AI service returned unexpected data (${text.slice(0, 80)}...). Try again.`);
  }
}

async function proxyStreamRequest(
  body: object,
  onChunk?: (text: string) => void,
  attempt = 1,
): Promise<string> {
  const response = await proxyFetch('/api/groq', body);

  if (!response.ok) {
    const errText = await response.text().catch(() => '(no body)');
    if (response.status === 429 && attempt <= 3) {
      const delay = Math.min(2 ** attempt * 1000 + Math.random() * 1000, 15000);
      await new Promise(r => setTimeout(r, delay));
      return proxyStreamRequest(body, onChunk, attempt + 1);
    }
    throw new Error(`Proxy error: ${response.status} ${errText}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ') && line.slice(6) !== '[DONE]') {
        try {
          const parsed = JSON.parse(line.slice(6));
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullContent += delta;
            onChunk?.(fullContent);
          }
        } catch {
          // skip malformed JSON in SSE
        }
      }
    }
  }

  return fullContent;
}

/**
 * Extracts subject-specific tags from the material text. Returns an array of the
 * most relevant topic keywords found in the text, or a default generic tag.
 */
function extractSubjectTags(text: string): string[] {
  // Collect capitalized multi-word phrases that look like topic headings
  const phrasePattern = /^([A-Z][A-Za-z\s\-&,/]+?)(?:\s*[:–—-]|\s*$)/gm;
  const matches = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = phrasePattern.exec(text)) !== null) {
    const phrase = m[1].trim();
    if (phrase.length > 3 && phrase.length < 60 && !phrase.match(/^(The|This|These|Those|Our|Your|How|What|Why|When|Where|Which) /)) {
      matches.add(phrase);
    }
  }
  // Also collect numbered/bullet list items that start with a key term
  const bulletPattern = /^[•\-*\d]+\.?\s+([A-Z][A-Za-z\s\-]+?)(?:\s*[:–—-]|\s*$)/gm;
  while ((m = bulletPattern.exec(text)) !== null) {
    const phrase = m[1].trim();
    if (phrase.length > 3 && phrase.length < 50) {
      matches.add(phrase);
    }
  }
  return matches.size > 0 ? Array.from(matches).slice(0, 8) : ['General'];
}

/**
 * Estimate how many cards to generate based on text length.
 * Targets ~30 cards for rich material (750+ words), scales down for shorter text.
 */
function estimateCardCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  return Math.max(5, Math.min(60, Math.round(wordCount / 12)));
}

const SYSTEM_PROMPT = (subjectTags: string[], targetCount: number) => {
  const tagHint = subjectTags.length > 0
    ? subjectTags.map(t => `"${t}"`).join(', ')
    : 'a relevant topic from the material';

  return `You are a flashcard generation assistant for SM-2 spaced repetition. Your cards must be optimized for ACTIVE RECALL — the user should be able to answer in 3-5 seconds.

RULES (strict — follow every one):

1. ONE FACT PER CARD — Each card tests exactly one specific fact, definition, or relationship. If the text has multiple distinct points about a topic, create multiple cards. NEVER combine multiple facts into one answer.

2. ANSWER LENGTH CAP — Each answer MUST be a short phrase or single sentence under 15-20 words. No multi-sentence paragraphs. No bullet lists. The answer should be something the user can recall in one mental flash.

3. RECALL-FRIENDLY QUESTIONS — Front should be a specific, pinpoint question that targets ONE concept. Avoid "list all", "explain everything", or "what are the types of X" — these inevitably produce long answers. Instead ask "What is X?", "What does Y mean?", "Who proposed Z?".

4. AUTO-SPLIT LONG CONTENT — If a topic naturally produces a long answer, split it into a "core concept" card plus one or more "example/detail" cards with separate questions.

5. TAG — Tag each card with the most relevant topic: ${tagHint}

6. CODE — If the content contains any code or commands, include them as a codeSnippet with the appropriate language.

7. COVERAGE — Generate approximately ${targetCount} cards (minimum 5). If the material is very brief you may generate fewer. Your goal is to cover EVERY distinct fact in the text with atomic cards.

8. OUTPUT FORMAT — Output ONLY valid JSON with no markdown wrapping:
{
  "title": "Suggested deck title (derived from the material subject)",
  "cards": [
    {
      "front": "Specific question testing one fact?",
      "back": "Short phrase or single sentence (under 20 words).",
      "tag": "Topic name from material",
      "codeSnippet": { "code": "command/code here", "language": "language-name" }
    }
  ]
}

IMPORTANT: Every card MUST be directly grounded in the provided study material. Do NOT generate information not present in the text.

CRITICAL: Output ONLY the raw JSON object. No introductory text, no explanations, no disclaimers, no conversational language. No markdown code blocks. Begin with { and end with }.`;
};

function truncateToTokenBudget(text: string, budgetTokens: number): string {
  const estimatedTokens = Math.ceil(text.length / 4);
  if (estimatedTokens <= budgetTokens) return text;

  const budgetChars = budgetTokens * 4;
  const headLen = Math.floor(budgetChars * 0.6);
  const tailLen = Math.floor(budgetChars * 0.4) - 80;
  const head = text.slice(0, headLen);
  const tail = text.slice(text.length - tailLen);
  return `${head}\n\n[... ${estimatedTokens - budgetTokens} tokens truncated from original ${estimatedTokens} tokens — full material not sent due to API token limits. The generated cards may not cover the entire text.]\n\n${tail}`;
}

export async function generateCardsFromText(
  client: Groq,
  text: string,
  _onChunk?: (text: string) => void,
  onProgress?: (current: number, target: number) => void,
): Promise<GenerationResponse> {
  const subjectTags = extractSubjectTags(text);
  const targetCount = estimateCardCount(text);
  const safeText = truncateToTokenBudget(text, 2000);

  const estimatedInputTokens = Math.ceil(safeText.length / 4) + 250;
  const maxOutput = Math.max(1000, Math.min(2000, 2000));

  const requestBody = {
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system' as const, content: SYSTEM_PROMPT(subjectTags, targetCount) },
      { role: 'user' as const, content: `Generate flashcards from this study material:\n\n${safeText}` },
    ],
    temperature: 0.3,
    max_tokens: maxOutput,
    response_format: { type: 'json_object' as const },
  };

  const response = IS_PROXY
    ? await proxyRequest(requestBody)
    : await client.chat.completions.create(requestBody);

  const fullContent = response.choices[0]?.message?.content || '';

  if (!fullContent.trim()) {
    throw new SyntaxError(
      'The AI output was cut off or malformed. Try shorter material or generate in smaller batches.'
    );
  }

  // Parse rate-limit headers from the raw response (best-effort in browser)
  let rateLimitRemaining: number | undefined;
  let rateLimitResetMs: number | undefined;
  try {
    const raw = response as any;
    const h = raw._response?.headers;
    if (h) {
      const rem = h.get('x-ratelimit-remaining-tokens');
      const reset = h.get('x-ratelimit-reset-tokens');
      if (rem !== null) rateLimitRemaining = parseInt(rem, 10);
      if (reset !== null) rateLimitResetMs = parseInt(reset, 10) * 1000;
    }
  } catch { /* headers not available in all browser contexts */ }

  onProgress?.(targetCount, targetCount);

  let cleaned = fullContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  let result: GenerationResult | null = null;

  function tryParse(raw: string): GenerationResult | null {
    try {
      return JSON.parse(raw) as GenerationResult;
    } catch { return null; }
  }

  // Attempt 1: full cleaned response
  result = tryParse(cleaned);

  // Attempt 2 (fallback): extract {…} + balance missing brackets
  if (!result) {
    const fb = cleaned.indexOf('{');
    if (fb !== -1) {
      let partial = cleaned.slice(fb);
      const opens = (partial.match(/\{/g) || []).length;
      const closes = (partial.match(/\}/g) || []).length;
      const arrOpens = (partial.match(/\[/g) || []).length;
      const arrCloses = (partial.match(/\]/g) || []).length;
      partial += ']'.repeat(Math.max(0, arrOpens - arrCloses));
      partial += '}'.repeat(Math.max(0, opens - closes));
      result = tryParse(partial);
    }
  }

  if (!result) {
    throw new SyntaxError(
      'The AI output was cut off or malformed. Try shorter material or generate in smaller batches.'
    );
  }

  const estimatedTokensUsed = estimatedInputTokens + maxOutput;

  return {
    ...result,
    rateLimitRemaining,
    rateLimitResetMs,
    estimatedTokensUsed,
  };
}

export async function explainConcept(
  client: Groq,
  question: string,
  answer: string,
  onChunk?: (text: string) => void
): Promise<string> {
  const body = {
    model: 'llama-3.1-8b-instant',
    messages: [
      {
        role: 'system' as const,
        content: 'You are an expert tutor. The user is reviewing a flashcard and needs help understanding the answer. Explain the concept clearly and concisely, using analogies if helpful. Do not just restate the answer; explain *why* it is correct.'
      },
      {
        role: 'user' as const,
        content: `Flashcard Question:\n${question}\n\nFlashcard Answer:\n${answer}\n\nPlease explain this concept to me.`
      },
    ],
    temperature: 0.5,
    max_tokens: 1024,
    stream: true as const,
  };

  if (IS_PROXY) {
    return proxyStreamRequest(body, onChunk);
  }

  const stream = await client.chat.completions.create(body);
  let fullContent = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    fullContent += delta;
    onChunk?.(fullContent);
  }
  return fullContent;
}

export async function cleanOCRText(
  client: Groq,
  text: string,
  onChunk?: (text: string) => void
): Promise<string> {
  const body = {
    model: 'llama-3.1-8b-instant',
    messages: [
      {
        role: 'system' as const,
        content: `You are an OCR cleanup assistant. The user provides OCR text from study materials. Your job is to reconstruct the original text.

Rules:
- Fix common OCR errors: broken compound words, stray characters, misread letters
- Preserve technical terms, proper nouns, and subject-specific terminology exactly
- Fix markdown formatting, bullet lists, diagram labels
- Output ONLY the cleaned text — no explanations, no introductions.`
      },
      {
        role: 'user' as const,
        content: `Clean this OCR text:\n\n${text}`
      },
    ],
    temperature: 0.1,
    max_tokens: 2048,
    stream: true as const,
  };

  if (IS_PROXY) {
    return proxyStreamRequest(body, onChunk);
  }

  const stream = await client.chat.completions.create(body);
  let fullContent = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    fullContent += delta;
    onChunk?.(fullContent);
  }
  return fullContent.trim();
}

export async function structureStudyMaterial(
  client: Groq,
  rawText: string,
  title: string,
  onChunk?: (text: string) => void
): Promise<string> {
  const body = {
    model: 'llama-3.1-8b-instant',
    messages: [
      {
        role: 'system' as const,
        content: `You are a study material formatting assistant. Given raw text extracted from study materials or OCR, reconstruct it into a clean, well-structured markdown document.

FORMATTING REQUIREMENTS (follow every one):

1. HEADINGS — Identify the main subject and use "## Title" for the first heading. Use "### Subtopic" for subsections. Use "#### Detail" for sub-subsections. Never use "#" (H1). End every heading with a blank line after it.

2. BULLET LISTS — Convert any list of items, features, steps, or components into bullet points using "- ". Each bullet should be a complete phrase. Separate bullet lists from surrounding text with blank lines before and after.

3. KEY TERMS — Bold every important technical term or keyword on its first occurrence with **bold** syntax.

4. PARAGRAPHS — Break long walls of text into short paragraphs of 2-4 sentences each. Separate paragraphs with a blank line.

5. SPACING — Every section heading must be preceded by exactly one blank line (except the very first heading). Every paragraph separated by one blank line. No excessive blank lines (never more than one consecutive empty line).

6. ORDER — Reorder content into a logical flow if the raw text is jumbled: introduction/concept first, then details/components, then examples, then summary.

7. PRESERVE — All technical terms, definitions, IP addresses, commands, code, and numbers exactly as written. Do NOT add new information. Do NOT generate flashcards.

8. OUTPUT — Output ONLY the cleaned markdown. No introductions, no explanations, no surrounding commentary.`
      },
      {
        role: 'user' as const,
        content: `Title: ${title}\n\nRaw text:\n${rawText}`
      }
    ],
    temperature: 0.1,
    max_tokens: 4096,
    stream: true as const,
  };

  if (IS_PROXY) {
    return proxyStreamRequest(body, onChunk);
  }

  const stream = await client.chat.completions.create(body);
  let fullContent = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    fullContent += delta;
    onChunk?.(fullContent);
  }
  return fullContent.trim();
}

function resizeImage(file: File, maxDim = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        const s = maxDim / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

export async function extractTextFromImageGroq(
  client: Groq,
  imageFile: File,
  onChunk?: (text: string) => void
): Promise<string> {
  const base64 = await resizeImage(imageFile, 1600);

  const body = {
    model: 'qwen/qwen3.6-27b',
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: 'Extract all text from this image exactly as written. Preserve all headings, bullet points, diagram labels (like PC1, SW1, R1), and all formatting. Return ONLY the extracted text with no introductions, no explanations, and no markdown wrapping.' },
          { type: 'image_url' as const, image_url: { url: base64, detail: 'high' as const } },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 2048,
    stream: true as const,
  };

  try {
    let fullContent: string;

    if (IS_PROXY) {
      fullContent = await proxyStreamRequest(body, onChunk);
    } else {
      const stream = await client.chat.completions.create(body);
      fullContent = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        fullContent += delta;
        onChunk?.(fullContent);
      }
    }

    if (!fullContent.trim()) {
      throw new Error('Groq Vision returned empty text');
    }

    return fullContent.trim();
  } catch (err: any) {
    const msg = err?.error?.message || err?.message || String(err);
    throw new Error(`Groq Vision OCR: ${msg}`);
  }
}
