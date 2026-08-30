/**
 * CLI entry point for ingestion: `npm run ingest`, or `npm run ingest -- --force`
 * after a chunking change, which a content hash cannot detect.
 */
import { createEmbedder, runIngestion, SqliteVectorStore } from '@corpus/rag';
import { loadConfig } from '../config.js';
import { initDatabase } from '../db/index.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const force = process.argv.includes('--force');
  // `--quiet` prints only the summary, for the setup script.
  const quiet = process.argv.includes('--quiet');
  const { db } = initDatabase(config.DATABASE_PATH);

  const embedder = createEmbedder(config.EMBEDDER, {
    cacheDir: config.MODEL_CACHE_DIR,
    onDownloadStart: () =>
      console.log('Loading the embedding model (first run downloads ~35 MB, then it is cached)...'),
  });

  console.log(`Ingesting ${config.CORPUS_DIR} with ${embedder.id}${force ? ' (forced)' : ''}\n`);
  const startedAt = Date.now();

  const run = await runIngestion({
    db,
    store: new SqliteVectorStore(db),
    embedder,
    corpusDir: config.CORPUS_DIR,
    force,
    onProgress: (event) => {
      if (event.type === 'scanned') console.log(`Found ${event.total} documents.\n`);
      if (event.type === 'failed') console.error(`  FAILED  ${event.path}: ${event.error}`);
      // Unchanged documents are the common case on a re-run; printing 142 of
      // them would bury the handful of lines that actually matter.
      if (!quiet && event.type === 'document' && event.action !== 'unchanged') {
        console.log(`  ${event.action.padEnd(9)} ${event.path}`);
      }
    },
  });

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `\n${run.status} in ${seconds}s - added ${run.added}, updated ${run.updated}, ` +
      `removed ${run.removed}, unchanged ${run.unchanged}, failed ${run.failed}`,
  );

  if (run.error) console.error(`\nRun error: ${run.error}`);

  db.close();
  process.exit(run.status === 'succeeded' && run.failed === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
