import { openDatabase, runMigrations, corpusMigrations, type Db } from '@corpus/rag';
import { apiMigrations } from './schema.js';

export type { Db };

/**
 * Opens the database and brings the schema up to date.
 *
 * Corpus migrations run before API migrations because the API's analytics table
 * is the only one that references anything outside its own module.
 */
export function initDatabase(path: string): { db: Db; applied: string[] } {
  const db = openDatabase({ path });
  const applied = runMigrations(db, [...corpusMigrations, ...apiMigrations]);
  return { db, applied };
}
