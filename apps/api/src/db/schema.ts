import type { Migration } from '@corpus/rag';

/**
 * Auth and analytics tables. Owned by `apps/api`, applied against the same
 * database as the corpus tables.
 */
export const apiMigrations: Migration[] = [
  {
    id: '001-auth',
    up: (db) => {
      db.exec(`
        create table users (
          id            text primary key,
          email         text not null unique collate nocase,
          password_hash text not null,
          role          text not null check (role in ('user', 'admin')),
          created_at    text not null default (datetime('now'))
        );
      `);

      // Refresh tokens are stored as hashes, never in the clear: a database read
      // should not hand the reader a working set of sessions. `rotated_to` makes
      // reuse of an already-rotated token detectable rather than merely invalid.
      db.exec(`
        create table refresh_tokens (
          id         text primary key,
          user_id    text not null references users (id) on delete cascade,
          token_hash text not null unique,
          expires_at text not null,
          created_at text not null default (datetime('now')),
          revoked_at text,
          rotated_to text references refresh_tokens (id)
        );

        create index refresh_tokens_user_idx on refresh_tokens (user_id);
      `);
    },
  },
  {
    id: '002-analytics',
    up: (db) => {
      // `user_id` is nullable and set null on delete: deleting a user must not
      // erase the analytics history, but must not keep pointing at them either.
      db.exec(`
        create table search_logs (
          id            text primary key,
          user_id       text references users (id) on delete set null,
          query         text not null,
          mode          text not null,
          result_count  integer not null,
          top_score     real,
          answered      integer not null default 0,
          refusal_reason text,
          latency_ms    integer not null,
          created_at    text not null default (datetime('now'))
        );

        create index search_logs_created_idx on search_logs (created_at desc);
        create index search_logs_user_idx    on search_logs (user_id);
      `);
    },
  },
  {
    id: '003-oauth-clients',
    up: (db) => {
      // Client secrets are argon2-hashed like user passwords: a client secret is
      // a credential, and reading the database should not yield a working one.
      db.exec(`
        create table oauth_clients (
          client_id   text primary key,
          secret_hash text not null,
          role        text not null check (role in ('user', 'admin')),
          scopes      text not null,
          description text not null default '',
          created_at  text not null default (datetime('now'))
        );
      `);
    },
  },
];
