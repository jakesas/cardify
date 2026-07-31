/**
 * Smart Auto-Formatter for Study Notes & Documents
 * Converts raw, unformatted, or squished plain text into clean, beautifully structured Markdown.
 */
export function autoFormatStudyContent(text: string): string {
  if (!text || !text.trim()) return '';

  let formatted = text.trim();

  // If the text is already heavily formatted with ## markdown headings, just ensure linebreaks
  const headingMatches = formatted.match(/^#{1,4}\s+.+$/gm);
  if (headingMatches && headingMatches.length >= 2) {
    // Standardize line breaks around headings
    formatted = formatted.replace(/(^|\n)(#{1,4}\s+.+)/g, '\n\n$2\n\n');
    return cleanWhitespace(formatted);
  }

  // ── 1. Auto-detect Major Topics / Sections ───────────────────────
  // E.g., "CCNA-1", "CCNA-2", "MODULE 1", "CHAPTER 1", "COMPUTER SYSTEM SERVICING"
  formatted = formatted.replace(
    /(^|\n|\s{2,})(CCNA-\d+|MODULE\s+\d+|CHAPTER\s+\d+|COMPUTER\s+SYSTEM\s+SERVICING|PURPOSIVE\s+COMMUNICATION|INTRO\s+TO\s+COMPUTERS[^\n]*|HISTORY\s+OF\s+COMPUTERS|COMPUTER\s+GENERATIONS|TYPES\s+OF\s+[A-Z\s]+|ARISTOTLE['’]S\s+MODEL|SHANNON-WEAVER|WHAT\s+IS\s+[A-Z\s\?]+)/gi,
    '\n\n## $2\n\n'
  );

  // ── 2. Auto-detect Sub-headings & Labels ending in colon or numbers ──
  // E.g., "Easy to remember:", "Function:", "Without it:", "1A. CPU Socket", "1B. CPU Connector"
  formatted = formatted.replace(
    /(^|\n)(\d+[A-Z]?\.\s+[^\n:]+)(\n|:)/g,
    '\n\n### $2\n\n'
  );

  formatted = formatted.replace(
    /(^|\n)(Function|Without it|Easy to remember|Capabilities of a Computer|Ethical communication|Four Basic Periods|First Development|Paper and Pens|Books and Libraries|The First Numbering systems|The First Calculator[^\n:]*):?/gi,
    '\n\n**$2:** '
  );

  // ── 3. Auto-format Term - Definition patterns ────────────────────
  // E.g., "Clarity – Easy to understand." or "Source – The person who sends..."
  formatted = formatted.replace(
    /(^|\n)([A-Z][A-Za-z0-9\s\/\(\)]+)\s*[–\-—:]\s*([A-Z0-9][^\n]+)/g,
    (match, p1, term, def) => {
      // Don't format if it's already a heading or bullet
      if (term.startsWith('#') || term.startsWith('-')) return match;
      const cleanTerm = term.trim();
      // Only bold terms that are under 60 chars (likely a key concept name)
      if (cleanTerm.length < 60 && !cleanTerm.toLowerCase().includes('without')) {
        return `${p1}- **${cleanTerm}** – ${def.trim()}`;
      }
      return match;
    }
  );

  // ── 4. Fix collapsed single newlines ──────────────────────────────
  // If the document has single \n without blank lines, convert them to \n\n for paragraphs
  const hasParagraphs = formatted.includes('\n\n');
  if (!hasParagraphs) {
    formatted = formatted.replace(/\n/g, '\n\n');
  } else {
    // Ensure lists and bullet points have clean spacing
    formatted = formatted.replace(/([^\n])\n(-|\*|\d+\.)/g, '$1\n\n$2');
  }

  return cleanWhitespace(formatted);
}

function cleanWhitespace(input: string): string {
  return input
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .trim();
}

/** Split document markdown into clean pages at section boundaries */
export function splitDocumentIntoPages(content: string): string[] {
  if (!content || !content.trim()) return [];

  // Try splitting by ## or ### section headings
  const sectionRegex = /^#{2,3}\s+.+$/gm;
  const matches = Array.from(content.matchAll(sectionRegex));

  if (matches.length >= 2) {
    const pages: string[] = [];
    for (let i = 0; i < matches.length; i++) {
      const startIdx = matches[i].index!;
      const endIdx = i + 1 < matches.length ? matches[i + 1].index! : content.length;
      const chunk = content.slice(startIdx, endIdx).trim();
      if (chunk) pages.push(chunk);
    }
    return pages;
  }

  // Fallback: Split by ~12 lines or ~300 words per page if no section headings exist
  const lines = content.split('\n\n');
  const pages: string[] = [];
  let currentChunk: string[] = [];

  lines.forEach((block) => {
    currentChunk.push(block);
    const combined = currentChunk.join('\n\n');
    if (combined.split(/\s+/).length >= 250) {
      pages.push(combined.trim());
      currentChunk = [];
    }
  });

  if (currentChunk.length > 0) {
    const remaining = currentChunk.join('\n\n').trim();
    if (remaining) pages.push(remaining);
  }

  return pages.length > 0 ? pages : [content];
}
