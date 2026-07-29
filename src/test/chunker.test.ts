import { describe, it, expect } from 'vitest';
import { chunkText, estimateCardsPerChunk } from '../utils/chunker';

describe('chunkText', () => {
  it('returns empty array for empty string', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(chunkText('   \n  \n  ')).toEqual([]);
  });

  it('returns the text as-is when within maxChars', () => {
    const text = 'Short text for testing.';
    expect(chunkText(text)).toEqual([text]);
  });

  it('preserves paragraph boundaries when possible', () => {
    const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.\n\nParagraph four.\n\nParagraph five.';
    const chunks = chunkText(text, 40);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    chunks.forEach(c => expect(c.length).toBeLessThanOrEqual(45));
  });

  it('splits on markdown headings', () => {
    const text = '# Introduction\n\nFirst paragraph.\n\n# Details\n\nSecond paragraph.';
    const chunks = chunkText(text, 50);
    chunks.forEach(c => expect(c).toMatch(/^(# |Introduction|Details|First|Second)/));
  });

  it('handles single block exceeding maxChars by force-splitting paragraphs', () => {
    const longBlock = Array.from({ length: 20 }, (_, i) => `Line number ${i + 1} of content here for testing purposes.`).join('\n\n');
    const chunks = chunkText(longBlock, 100);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    chunks.forEach(c => expect(c.length).toBeLessThanOrEqual(110));
  });

  it('preserves heading with its content when under maxChars', () => {
    const text = '# Chapter 1\n\nContent for chapter one.\n\nMore content.';
    const result = chunkText(text, 200);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('# Chapter 1');
    expect(result[0]).toContain('Content for chapter one.');
  });
});

describe('estimateCardsPerChunk', () => {
  it('returns at least 3 cards for very short text', () => {
    expect(estimateCardsPerChunk('short')).toBe(3);
  });

  it('returns roughly wordCount / 15 for medium text', () => {
    const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    // 60 words / 15 = 4, clamped to [3, 20]
    expect(estimateCardsPerChunk(text)).toBe(4);
  });

  it('caps at 20 for very long text', () => {
    const text = Array.from({ length: 500 }, (_, i) => `word${i}`).join(' ');
    expect(estimateCardsPerChunk(text)).toBe(20);
  });
});
