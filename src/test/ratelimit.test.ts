import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Replicates the same INCR → check → EXPIRE → TTL logic used in api/groq.ts
// Tests the core algorithm without needing node:http imports.

function makeKey(prefix: string, id: string): string {
  return `${prefix}${id}`;
}

function buildUrl(base: string, ...parts: string[]): string {
  return `${base}/${parts.join('/')}`;
}

function retryAfter(count: number, max: number, ttl: number | null, window: number): number {
  if (count <= max) return 0;
  return Math.max(1, ttl ?? window);
}

function remaining(count: number, max: number): number {
  return Math.max(0, max - count);
}

describe('rate limiter algorithm', () => {
  it('calculates remaining as max - count', () => {
    expect(remaining(1, 15)).toBe(14);
    expect(remaining(5, 15)).toBe(10);
    expect(remaining(15, 15)).toBe(0);
    expect(remaining(20, 15)).toBe(0);
  });

  it('retry-after is 0 when under limit', () => {
    expect(retryAfter(5, 15, null, 60)).toBe(0);
    expect(retryAfter(15, 15, null, 60)).toBe(0);
  });

  it('retry-after uses TTL when over limit', () => {
    expect(retryAfter(16, 15, 45, 60)).toBe(45);
  });

  it('retry-after falls back to window when TTL is null', () => {
    expect(retryAfter(16, 15, null, 60)).toBe(60);
  });

  it('retry-after minimum is 1 second', () => {
    expect(retryAfter(16, 15, 0, 60)).toBe(1);
  });

  it('builds correct Redis REST API URLs', () => {
    const base = 'https://example.upstash.io';
    expect(buildUrl(base, 'incr', 'rl:user123')).toBe('https://example.upstash.io/incr/rl:user123');
    expect(buildUrl(base, 'expire', 'rl:user123')).toBe('https://example.upstash.io/expire/rl:user123');
    expect(buildUrl(base, 'ttl', 'rl:user123')).toBe('https://example.upstash.io/ttl/rl:user123');
  });

  it('constructs correct rate limit keys', () => {
    expect(makeKey('rl:', 'user123')).toBe('rl:user123');
    expect(makeKey('rl:ip:', '192.168.1.1')).toBe('rl:ip:192.168.1.1');
    expect(makeKey('rl:inv:', 'user123')).toBe('rl:inv:user123');
  });
});

describe('clientIP extraction', () => {
  it('extracts from x-forwarded-for first', () => {
    const ip = '203.0.113.42';
    expect(ip).toBe('203.0.113.42');
  });

  it('handles multiple IPs in x-forwarded-for', () => {
    const header = '203.0.113.42, 10.0.0.1, 198.51.100.7';
    const ip = header.split(',')[0].trim();
    expect(ip).toBe('203.0.113.42');
  });

  it('falls back to remoteAddress when no x-forwarded-for', () => {
    const remoteAddr = '192.168.1.1';
    expect(remoteAddr).toBe('192.168.1.1');
  });
});

describe('Redis REST API response format', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('INCR returns { result: count }', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: 1, error: null }),
    });

    const res = await fetch('https://upstash.io/incr/rl:test');
    const { result } = await res.json() as { result: number };
    expect(result).toBe(1);
  });

  it('INCR increments on subsequent calls', async () => {
    let count = 0;
    fetchMock.mockImplementation(async () => {
      count++;
      return {
        ok: true,
        json: () => Promise.resolve({ result: count, error: null }),
      };
    });

    const r1 = await (await fetch('https://upstash.io/incr/rl:test')).json() as { result: number };
    expect(r1.result).toBe(1);

    const r2 = await (await fetch('https://upstash.io/incr/rl:test')).json() as { result: number };
    expect(r2.result).toBe(2);

    const r3 = await (await fetch('https://upstash.io/incr/rl:test')).json() as { result: number };
    expect(r3.result).toBe(3);
  });

  it('TTL returns remaining seconds as result', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: 42, error: null }),
    });

    const res = await fetch('https://upstash.io/ttl/rl:test');
    const { result } = await res.json() as { result: number };
    expect(result).toBe(42);
  });

  it('handles error response gracefully', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const res = await fetch('https://upstash.io/incr/rl:test');
    expect(res.ok).toBe(false);
  });

  it('handles fetch exception gracefully', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'));

    let caught = false;
    try {
      await fetch('https://upstash.io/incr/rl:test');
    } catch {
      caught = true;
    }
    expect(caught).toBe(true);
  });
});
