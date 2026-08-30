import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import type { DocType } from '@corpus/shared';

export interface LoadedDocument {
  /** Corpus-relative POSIX path. Stable across operating systems, and the citation key. */
  path: string;
  title: string;
  docType: DocType;
  docDate: string | null;
  content: string;
  /** sha256 of the content. The whole basis of incremental re-indexing. */
  contentHash: string;
}

/**
 * Directory name to document type. The corpus already sorts itself; we read its
 * convention rather than inventing metadata it does not have. Anything at the
 * top level is a `reference` — the SDK notes, network specs, and build docs.
 */
const DOC_TYPE_BY_DIRECTORY: Record<string, DocType> = {
  'client-briefs': 'client-brief',
  'meeting-notes': 'meeting-note',
  'delivery-reports': 'delivery-report',
  postmortems: 'postmortem',
  changelogs: 'changelog',
  guides: 'guide',
};

export function classifyDocument(relativePath: string): DocType {
  const segments = relativePath.split('/');
  // A path with no directory part is a top-level file, which is a `reference`.
  if (segments.length < 2) return 'reference';
  return DOC_TYPE_BY_DIRECTORY[segments[0]!] ?? 'reference';
}

/**
 * Pulls a date out of the filename where the corpus encodes one.
 *
 * Meeting notes use `2026-06-15-production-sync.md`; delivery reports use
 * `2026-04-bubble-bakery.md` with no day; some references carry the date at the
 * end, like `incident-postmortem-2026-03.md`. A month-only date is normalised to
 * the first of that month so the column stays a real date and sorts correctly —
 * the day is not information we have, and inventing one is better than storing
 * three different shapes.
 */
export function extractDate(relativePath: string): string | null {
  const filename = relativePath.split('/').pop() ?? relativePath;

  const fullDate = /(\d{4})-(\d{2})-(\d{2})/.exec(filename);
  if (fullDate) return `${fullDate[1]}-${fullDate[2]}-${fullDate[3]}`;

  const monthOnly = /(\d{4})-(\d{2})/.exec(filename);
  if (monthOnly) return `${monthOnly[1]}-${monthOnly[2]}-01`;

  return null;
}

/** First `# ` heading, falling back to a readable form of the filename. */
export function extractTitle(content: string, relativePath: string): string {
  const heading = /^#\s+(.+)$/m.exec(content);
  if (heading?.[1]) return heading[1].trim();

  const filename = (relativePath.split('/').pop() ?? relativePath).replace(/\.md$/i, '');
  return filename.replace(/[-_]/g, ' ');
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function walkMarkdown(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdown(root, full)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(full);
    }
  }

  return files;
}

/**
 * Reads every markdown file under `corpusDir`, sorted by path so that ingestion
 * runs are reproducible and their logs diffable.
 */
export async function loadCorpus(corpusDir: string): Promise<LoadedDocument[]> {
  const files = await walkMarkdown(corpusDir);

  const documents = await Promise.all(
    files.map(async (file): Promise<LoadedDocument> => {
      const content = await readFile(file, 'utf8');
      // Normalise line endings before hashing: a CRLF checkout must not look
      // like a changed document to the incremental pass.
      const normalised = content.replace(/\r\n/g, '\n');
      const relativePath = relative(corpusDir, file).split(sep).join(posix.sep);

      return {
        path: relativePath,
        title: extractTitle(normalised, relativePath),
        docType: classifyDocument(relativePath),
        docDate: extractDate(relativePath),
        content: normalised,
        contentHash: hashContent(normalised),
      };
    }),
  );

  return documents.sort((a, b) => a.path.localeCompare(b.path));
}
