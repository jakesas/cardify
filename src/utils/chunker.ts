/**
 * Chunk long text into semantic sections for batched AI processing.
 *
 * Strategy:
 * 1. Split into blocks at natural boundaries (headings, numbered sections,
 *    ALL-CAPS titles, paragraph breaks).
 * 2. Group consecutive blocks into chunks up to `maxChars` each.
 * 3. A block that alone exceeds `maxChars` is force-split at the paragraph
 *    level — never at mid-sentence.
 */

/** A single indivisible block of text. */
interface Block {
  /** Heading text if this block starts with a detected header, else empty. */
  heading: string;
  /** Raw content of the block (excludes the heading line). */
  content: string;
}

/**
 * Split raw text into semantic blocks based on heading / section patterns.
 * Each block is meant to stay together — splitting inside a block loses
 * context for the AI.
 */
function extractBlocks(text: string): Block[] {
  const blocks: Block[] = [];

  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

  for (const para of paragraphs) {
    const lines = para.split('\n');
    const firstLine = lines[0].trim();
    const rest = lines.slice(1).join('\n').trim();

    // Check if first line looks like a heading
    if (
      /^#{1,6}\s/.test(firstLine) ||                                    // markdown ##
      /^[A-Z][A-Za-z\s\-/]+(?:\n-{3,})?$/.test(firstLine) ||           // Title ---
      /^(?:[A-Z][A-Z\s]{4,}|[A-Z][a-z]+(?:[\s\-][A-Z][a-z]+)+)$/.test(firstLine) || // ALL CAPS or Title Case multi-word
      /^\d+[\.\)]\s+[A-Z]/.test(firstLine) ||                           // "1. Section" or "1) Section"
      /^[A-Z][\.\)]\s+[A-Z]/.test(firstLine)                            // "A. Section" or "A) Section"
    ) {
      blocks.push({ heading: firstLine, content: rest });
    } else if (blocks.length > 0) {
      // Append to the last block's content
      const last = blocks[blocks.length - 1];
      last.content = last.content ? `${last.content}\n\n${para}` : para;
    } else {
      blocks.push({ heading: '', content: para });
    }
  }

  return blocks;
}

/**
 * Chunk text into segments up to `maxChars` each (default 8000).
 *
 * - Preserves section boundaries — a heading stays with its content.
 * - Only force-splits mid-section when a single section exceeds `maxChars`.
 * - Returns an array of chunk strings ready to feed to the AI.
 */
export function chunkText(text: string, maxChars = 8000): string[] {
  if (!text.trim()) return [];
  if (text.length <= maxChars) return [text];

  const blocks = extractBlocks(text);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  function flush() {
    if (current.length > 0) {
      chunks.push(current.join('\n\n'));
      current = [];
      currentLen = 0;
    }
  }

  for (const block of blocks) {
    const blockText = block.heading
      ? block.content
        ? `${block.heading}\n${block.content}`
        : block.heading
      : block.content;
    const blockLen = blockText.length;

    // Single block exceeds maxChars → force-split by paragraphs
    if (blockLen > maxChars) {
      flush(); // push whatever accumulated
      const subParas = blockText.split(/\n\n+/).filter(Boolean);
      let subBatch: string[] = [];
      let subLen = 0;
      for (const para of subParas) {
        if (subLen + para.length > maxChars && subBatch.length > 0) {
          chunks.push(subBatch.join('\n\n'));
          subBatch = [];
          subLen = 0;
        }
        subBatch.push(para);
        subLen += para.length;
      }
      if (subBatch.length > 0) {
        chunks.push(subBatch.join('\n\n'));
      }
      continue;
    }

    // Would exceed limit → flush first
    if (currentLen + blockLen > maxChars) {
      flush();
    }

    current.push(blockText);
    currentLen += blockLen;
  }

  flush();
  return chunks.filter(Boolean);
}

/**
 * Get the recommended number of cards per chunk based on chunk size.
 */
export function estimateCardsPerChunk(chunk: string): number {
  const wordCount = chunk.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.min(20, Math.round(wordCount / 15)));
}
