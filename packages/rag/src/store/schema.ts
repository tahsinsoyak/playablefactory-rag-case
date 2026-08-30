import type { Migration } from './migrate.js';

/** Must match `Embedder.dimensions`. Changing it requires a new migration and a full re-index. */
export const EMBEDDING_DIMENSIONS = 384;

/**
 * Corpus and index tables. Owned by `packages/rag`.
 *
 * On the FTS5 tokenizer: the default `unicode61` keeps `LumenSDK.init` as one
 * token, so a keyword search for `lumen` misses it — and this corpus is full of
 * identifiers (`lumen.track`, `first_interaction`, `cta_click`). Adding `.` and
 * `_` as token characters splits them, so the keyword half can match the parts a
 * person actually types. Measured against the eval in `docs/eval-results.md`.
 */
export const corpusMigrations: Migration[] = [
  {
    id: '001-corpus',
    up: (db) => {
      db.exec(`
        create table documents (
          id            text primary key,
          path          text not null unique,
          title         text not null,
          doc_type      text not null,
          doc_date      text,
          content_hash  text not null,
          status        text not null default 'pending',
          chunk_count   integer not null default 0,
          embedder_id   text,
          indexed_at    text,
          error         text
        );

        create index documents_doc_type_idx on documents (doc_type);
        create index documents_status_idx   on documents (status);

        create table chunks (
          id          text primary key,
          document_id text not null references documents (id) on delete cascade,
          ordinal     integer not null,
          heading     text,
          text        text not null,
          token_count integer not null,
          unique (document_id, ordinal)
        );

        create index chunks_document_idx on chunks (document_id);
      `);

      db.exec(`
        create virtual table vec_chunks using vec0 (
          chunk_rowid integer primary key,
          embedding   float[${EMBEDDING_DIMENSIONS}]
        )
      `);

      // vec0 keys on an integer rowid, but chunk ids are uuids. This is the
      // bridge between the two, and the reason chunk deletion has to go through
      // the store rather than a bare `delete from chunks`.
      db.exec(`
        create table chunk_rowids (
          chunk_rowid integer primary key autoincrement,
          chunk_id    text not null unique references chunks (id) on delete cascade
        );

        create index chunk_rowids_chunk_id_idx on chunk_rowids (chunk_id);
      `);

      db.exec(`
        create virtual table chunks_fts using fts5 (
          text,
          heading,
          tokenize = "unicode61 tokenchars '.-_'"
        )
      `);

      db.exec(`
        create table ingestion_runs (
          id          text primary key,
          started_at  text not null,
          finished_at text,
          status      text not null,
          added       integer not null default 0,
          updated     integer not null default 0,
          removed     integer not null default 0,
          unchanged   integer not null default 0,
          failed      integer not null default 0,
          embedder_id text not null,
          error       text
        );

        create index ingestion_runs_started_idx on ingestion_runs (started_at desc);
      `);
    },
  },
];
