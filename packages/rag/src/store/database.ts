import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

export type Db = Database.Database;

export interface OpenDatabaseOptions {
  /** File path, or `:memory:` for tests. */
  path: string;
  readonly?: boolean;
}

/**
 * Opens the database and loads the vector extension.
 *
 * The whole system shares one SQLite file: corpus tables, auth tables, and
 * analytics. That is deliberate — it means an ingestion run writes the document
 * row, its chunks, the vector index, and the keyword index inside a single
 * transaction, so the four can never disagree about what is indexed.
 */
export function openDatabase({ path, readonly = false }: OpenDatabaseOptions): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(path, { readonly });
  sqliteVec.load(db);

  // WAL lets the API read while an ingestion run writes, which is the whole
  // point of being able to trigger ingestion from the dashboard.
  if (!readonly) {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');
  // Without this, a concurrent ingestion makes reads fail instantly rather than wait.
  db.pragma('busy_timeout = 5000');

  return db;
}

/** Reports the loaded extension versions. Surfaced on the dashboard's index-health panel. */
export function databaseVersions(db: Db): { sqlite: string; vec: string } {
  const row = db.prepare('select sqlite_version() as sqlite, vec_version() as vec').get() as {
    sqlite: string;
    vec: string;
  };
  return row;
}
