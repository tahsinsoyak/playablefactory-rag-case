import type { Db } from './database.js';

export interface Migration {
  /** Unique and ordered. Applied ascending, once each, never re-run. */
  id: string;
  up: (db: Db) => void;
}

/**
 * A deliberately small migration runner.
 *
 * Each module migrates the tables it owns: `packages/rag` owns the corpus and
 * index tables, `apps/api` owns users and analytics. Both apply against the same
 * database, so ownership stays legible without needing a second store.
 */
export function runMigrations(db: Db, migrations: Migration[]): string[] {
  db.exec(`
    create table if not exists schema_migrations (
      id         text primary key,
      applied_at text not null default (datetime('now'))
    )
  `);

  const alreadyApplied = new Set(
    db
      .prepare('select id from schema_migrations')
      .all()
      .map((row) => (row as { id: string }).id),
  );

  const applied: string[] = [];
  const record = db.prepare('insert into schema_migrations (id) values (?)');

  for (const migration of migrations) {
    if (alreadyApplied.has(migration.id)) continue;

    // Each migration is its own transaction: a failure leaves the ones before it
    // applied and recorded, so a re-run resumes rather than starting over.
    db.transaction(() => {
      migration.up(db);
      record.run(migration.id);
    })();

    applied.push(migration.id);
  }

  return applied;
}
