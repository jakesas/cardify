import { Card } from '../types';

interface RawCard {
  front: string;
  back: string;
  tag?: string;
  codeSnippet?: { code: string; language: string };
}

/**
 * Takes an array of generated cards and produces a clean, structured
 * Markdown study guide — grouped by tag, with headings, bold terms,
 * and fenced code blocks. No AI required.
 */
export function generateStudyMaterial(cards: RawCard[]): string {
  if (!cards.length) return '';

  // ── 1. Group cards by tag ──────────────────────────────────────────
  const groups = new Map<string, RawCard[]>();
  for (const card of cards) {
    const tag = (card.tag || 'General').trim();
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag)!.push(card);
  }

  // ── 2. Sort tags alphabetically (General always last) ─────────────
  const sortedTags = [...groups.keys()].sort((a, b) => {
    if (a === 'General') return 1;
    if (b === 'General') return -1;
    return a.localeCompare(b);
  });

  // ── 3. Build Markdown output ──────────────────────────────────────
  const sections: string[] = [];

  for (const tag of sortedTags) {
    const tagCards = groups.get(tag)!;
    const lines: string[] = [`## ${tag}`];

    for (const card of tagCards) {
      const front = card.front.trim();
      const back = card.back.trim();

      if (card.codeSnippet?.code) {
        // Format as term + definition + code block
        lines.push('');
        lines.push(`**${front}**`);
        lines.push('');
        lines.push(back);
        lines.push('');
        lines.push('```' + (card.codeSnippet.language || ''));
        lines.push(card.codeSnippet.code.trim());
        lines.push('```');
      } else {
        // Format as term – definition on one line
        lines.push('');
        lines.push(`**${front}** – ${back}`);
      }
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Same utility but accepts full Card objects (e.g. from existing deck cards).
 */
export function generateStudyMaterialFromCards(cards: Card[]): string {
  return generateStudyMaterial(cards);
}
