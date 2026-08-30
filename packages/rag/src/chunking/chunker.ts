import type { LoadedDocument } from '../corpus/loader.js';

export interface Chunk {
  ordinal: number;
  /** The `##` section this text came from, or null for the document's preamble. */
  heading: string | null;
  /** The passage as it will be shown to a reader and sent to the model. */
  text: string;
  /**
   * What actually gets embedded: the passage prefixed with its document title and
   * heading. The corpus is full of short sections whose subject lives only in the
   * heading — "## Sign-off" means nothing on its own, but "Delivery Report: Merge
   * Marina, 2025-05 > Sign-off" is retrievable. Storing both keeps citations
   * showing the real text while retrieval sees the context.
   */
  embedText: string;
  tokenCount: number;
}

export interface ChunkOptions {
  /** Target size. bge-small truncates at 512 tokens, so this leaves headroom for the prefix. */
  maxTokens?: number;
  /** Sentences of overlap carried into a split chunk, to avoid cutting an answer in half. */
  overlapTokens?: number;
}

/**
 * Rough token estimate: ~4 characters per token for English prose.
 *
 * Deliberately not a real tokenizer. The only decisions it drives are "is this
 * section too big to embed in one piece" and a display count — both tolerant of
 * being 15% out, and neither worth a dependency that has to agree with the
 * model's own vocabulary.
 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Splits on `##`+ headings, keeping each heading with the body beneath it. */
interface Section {
  heading: string | null;
  body: string;
}

function splitIntoSections(content: string): Section[] {
  const lines = content.split('\n');
  const sections: Section[] = [];

  let heading: string | null = null;
  let buffer: string[] = [];

  const flush = (): void => {
    const body = buffer.join('\n').trim();
    if (body.length > 0) sections.push({ heading, body });
    buffer = [];
  };

  for (const line of lines) {
    const match = /^(#{2,6})\s+(.+)$/.exec(line);
    if (match) {
      flush();
      heading = match[2]!.trim();
      continue;
    }

    // The `# Title` line is dropped: it is already carried as the document title
    // and repeating it in the body wastes embedding budget on every chunk.
    if (/^#\s+/.test(line)) continue;

    buffer.push(line);
  }

  flush();
  return sections;
}

/** Splits an oversized section on paragraph boundaries, with overlap. */
function splitLongBody(body: string, maxTokens: number, overlapTokens: number): string[] {
  const paragraphs = body.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const parts: string[] = [];

  let current: string[] = [];
  let currentTokens = 0;

  for (const paragraph of paragraphs) {
    const tokens = estimateTokens(paragraph);

    if (currentTokens + tokens > maxTokens && current.length > 0) {
      parts.push(current.join('\n\n'));

      // Carry the tail of the previous part forward, so a fact spanning the
      // boundary is still retrievable from one chunk.
      const overlap: string[] = [];
      let overlapSize = 0;
      for (let i = current.length - 1; i >= 0 && overlapSize < overlapTokens; i -= 1) {
        overlap.unshift(current[i]!);
        overlapSize += estimateTokens(current[i]!);
      }

      current = [...overlap];
      currentTokens = overlapSize;
    }

    current.push(paragraph);
    currentTokens += tokens;
  }

  if (current.length > 0) parts.push(current.join('\n\n'));
  return parts;
}

/**
 * Heading-aware chunking, never crossing a document boundary.
 *
 * Most documents in this corpus are 400–1000 bytes and become a single chunk,
 * which is the right outcome: splitting a 600-byte postmortem into fragments
 * would fracture citations without improving recall.
 */
export function chunkDocument(document: LoadedDocument, options: ChunkOptions = {}): Chunk[] {
  const maxTokens = options.maxTokens ?? 400;
  const overlapTokens = options.overlapTokens ?? 60;

  const sections = splitIntoSections(document.content);
  const chunks: Chunk[] = [];

  for (const section of sections) {
    const bodies =
      estimateTokens(section.body) > maxTokens
        ? splitLongBody(section.body, maxTokens, overlapTokens)
        : [section.body];

    for (const body of bodies) {
      const context = section.heading ? `${document.title} > ${section.heading}` : document.title;

      chunks.push({
        ordinal: chunks.length,
        heading: section.heading,
        text: body,
        embedText: `${context}\n\n${body}`,
        tokenCount: estimateTokens(body),
      });
    }
  }

  // A document with no body at all still deserves a chunk, so it is searchable
  // by title and shows as indexed rather than silently contributing nothing.
  if (chunks.length === 0) {
    chunks.push({
      ordinal: 0,
      heading: null,
      text: document.title,
      embedText: document.title,
      tokenCount: estimateTokens(document.title),
    });
  }

  return chunks;
}
