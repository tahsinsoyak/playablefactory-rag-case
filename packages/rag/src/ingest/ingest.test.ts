import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Embedder } from '../ports/index.js';
import { openDatabase, type Db } from '../store/database.js';
import { runMigrations } from '../store/migrate.js';
import { corpusMigrations } from '../store/schema.js';
import { SqliteVectorStore } from '../store/sqlite-store.js';
import { classifyDocument, extractDate, extractTitle } from '../corpus/loader.js';
import { chunkDocument } from '../chunking/chunker.js';
import { runIngestion } from './ingest.js';

/**
 * Deterministic stand-in for the real model: the incremental logic under test is
 * about hashes and counts, not about vector quality, and a fake keeps the suite
 * at milliseconds instead of half a minute.
 */
class FakeEmbedder implements Embedder {
  readonly id = 'fake-embedder';
  readonly dimensions = 384;
  calls = 0;

  async embed(texts: string[]): Promise<Float32Array[]> {
    this.calls += texts.length;
    return texts.map((text) => {
      const vector = new Float32Array(this.dimensions);
      for (let i = 0; i < text.length; i += 1) {
        vector[i % this.dimensions] += text.charCodeAt(i) / 1000;
      }
      return vector;
    });
  }
}

let corpusDir: string;
let db: Db;

beforeEach(async () => {
  corpusDir = await mkdtemp(join(tmpdir(), 'corpus-test-'));
  db = openDatabase({ path: ':memory:' });
  runMigrations(db, corpusMigrations);
});

afterEach(async () => {
  db.close();
  await rm(corpusDir, { recursive: true, force: true });
});

async function write(relativePath: string, content: string): Promise<void> {
  const full = join(corpusDir, relativePath);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content, 'utf8');
}

function ingest(embedder: Embedder, force = false) {
  return runIngestion({
    db,
    store: new SqliteVectorStore(db),
    embedder,
    corpusDir,
    force,
  });
}

function counts(): { chunks: number; vectors: number; fts: number } {
  const one = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
  return {
    chunks: one('select count(*) as n from chunks'),
    vectors: one('select count(*) as n from vec_chunks'),
    fts: one('select count(*) as n from chunks_fts'),
  };
}

describe('corpus metadata', () => {
  it('classifies by directory, treating top-level files as reference', () => {
    assert.equal(classifyDocument('client-briefs/merge-marina.md'), 'client-brief');
    assert.equal(classifyDocument('meeting-notes/2026-06-15-production-sync.md'), 'meeting-note');
    assert.equal(classifyDocument('sdk-notes-v3.md'), 'reference');
  });

  it('reads dates the corpus encodes, normalising a month to its first day', () => {
    assert.equal(extractDate('meeting-notes/2026-06-15-production-sync.md'), '2026-06-15');
    assert.equal(extractDate('delivery-reports/2026-04-bubble-bakery.md'), '2026-04-01');
    assert.equal(extractDate('incident-postmortem-2026-03.md'), '2026-03-01');
    assert.equal(extractDate('qa-checklist.md'), null);
  });

  it('takes the title from the H1, falling back to the filename', () => {
    assert.equal(
      extractTitle('# Lumen SDK v3 (current)\n\nbody', 'sdk-notes-v3.md'),
      'Lumen SDK v3 (current)',
    );
    assert.equal(extractTitle('no heading here', 'style-guide-ui.md'), 'style guide ui');
  });
});

describe('chunking', () => {
  const doc = {
    path: 'delivery-reports/2025-05-merge-marina.md',
    title: 'Delivery Report: Merge Marina, 2025-05',
    docType: 'delivery-report' as const,
    docDate: '2025-05-01',
    contentHash: 'x',
    content: `# Delivery Report: Merge Marina, 2025-05

Client: BlueHarbor Interactive.

## QA findings and fixes
- Memory grew slightly after repeated loops.

## Sign-off
Checklist attached to the delivery ticket.`,
  };

  it('splits on headings and keeps the heading with its body', () => {
    const chunks = chunkDocument(doc);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0]!.heading, null);
    assert.equal(chunks[1]!.heading, 'QA findings and fixes');
    assert.equal(chunks[2]!.heading, 'Sign-off');
  });

  it('prefixes the embedded text with title and heading, but not the shown text', () => {
    const signOff = chunkDocument(doc)[2]!;
    // "Sign-off" alone is unretrievable; with its document title it is not.
    assert.ok(signOff.embedText.startsWith('Delivery Report: Merge Marina, 2025-05 > Sign-off'));
    assert.ok(!signOff.text.includes('Merge Marina'), 'displayed text must stay verbatim');
  });

  it('drops the H1 line from chunk bodies', () => {
    for (const chunk of chunkDocument(doc)) {
      assert.ok(!chunk.text.startsWith('#'), 'H1 is carried as the title, not repeated in a chunk');
    }
  });
});

describe('ingestion', () => {
  it('indexes documents into all three indexes consistently', async () => {
    await write('guides/review-process.md', '# Review Process\n\nEvery delivery gets a review.');
    await write('sdk-notes-v3.md', '# Lumen SDK v3\n\nCall LumenSDK.init(config) first.');

    const run = await ingest(new FakeEmbedder());

    assert.equal(run.status, 'succeeded');
    assert.equal(run.added, 2);
    assert.equal(run.failed, 0);

    const { chunks, vectors, fts } = counts();
    assert.equal(chunks, vectors, 'every chunk needs a vector');
    assert.equal(chunks, fts, 'every chunk needs an FTS row');
  });

  it('re-embeds nothing when no content changed', async () => {
    await write('a.md', '# A\n\nbody');
    const embedder = new FakeEmbedder();

    await ingest(embedder);
    const afterFirst = embedder.calls;
    assert.ok(afterFirst > 0);

    const second = await ingest(embedder);
    assert.equal(second.unchanged, 1);
    assert.equal(second.added, 0);
    assert.equal(embedder.calls, afterFirst, 'an unchanged document must not be re-embedded');
  });

  it('detects added, changed, and removed documents', async () => {
    await write('a.md', '# A\n\noriginal');
    await write('b.md', '# B\n\nbody');
    const embedder = new FakeEmbedder();
    await ingest(embedder);

    await write('a.md', '# A\n\nchanged text');
    await write('c.md', '# C\n\nnew document');
    await rm(join(corpusDir, 'b.md'));

    const run = await ingest(embedder);
    assert.equal(run.updated, 1);
    assert.equal(run.added, 1);
    assert.equal(run.removed, 1);
  });

  it('leaves no orphaned vectors or FTS rows when a document is removed', async () => {
    await write('a.md', '# A\n\n## One\nfirst\n\n## Two\nsecond');
    const embedder = new FakeEmbedder();
    await ingest(embedder);
    assert.ok(counts().vectors > 1);

    await rm(join(corpusDir, 'a.md'));
    await ingest(embedder);

    assert.deepEqual(counts(), { chunks: 0, vectors: 0, fts: 0 });
  });

  it('re-embeds everything when the embedder identity changes', async () => {
    await write('a.md', '# A\n\nbody');
    await ingest(new FakeEmbedder());

    class OtherEmbedder extends FakeEmbedder {
      override readonly id = 'different-embedder';
    }
    const other = new OtherEmbedder();
    const run = await ingest(other);

    // Vectors from two models are not comparable, so identical text still
    // has to be rebuilt.
    assert.equal(run.updated, 1);
    assert.equal(run.unchanged, 0);
    assert.ok(other.calls > 0);
  });

  it('records a run row for every pass', async () => {
    await write('a.md', '# A\n\nbody');
    const embedder = new FakeEmbedder();
    await ingest(embedder);
    await ingest(embedder);

    const runs = db.prepare('select status from ingestion_runs').all();
    assert.equal(runs.length, 2, 'ingestion must be observable after the fact');
  });

  it('keeps indexing after one document fails, and records why', async () => {
    await write('good.md', '# Good\n\nbody');
    await write('bad.md', '# Bad\n\nbody');

    class FlakyEmbedder extends FakeEmbedder {
      override async embed(texts: string[]): Promise<Float32Array[]> {
        if (texts.some((t) => t.includes('Bad'))) throw new Error('embedding failed');
        return super.embed(texts);
      }
    }

    const run = await ingest(new FlakyEmbedder());

    assert.equal(run.failed, 1);
    assert.equal(run.added, 1, 'the healthy document still gets indexed');
    assert.equal(run.status, 'succeeded', 'one bad document does not fail the whole run');

    const bad = db.prepare("select status, error from documents where path = 'bad.md'").get() as {
      status: string;
      error: string;
    };
    assert.equal(bad.status, 'failed');
    assert.match(bad.error, /embedding failed/);
  });
});
