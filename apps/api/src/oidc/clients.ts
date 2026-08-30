import { timingSafeEqual } from 'node:crypto';
import type { Role } from '@corpus/shared';
import type { Db } from '../db/index.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';

/**
 * OAuth clients allowed to request access tokens.
 *
 * Secrets are stored argon2-hashed, exactly like user passwords: a client secret
 * is a credential, and a database read should not hand the reader a working one.
 */
export interface OAuthClient {
  clientId: string;
  role: Role;
  scopes: string[];
  description: string;
}

interface ClientRow {
  client_id: string;
  secret_hash: string;
  role: Role;
  scopes: string;
  description: string;
}

export async function upsertClient(
  db: Db,
  input: { clientId: string; secret: string; role: Role; scopes: string[]; description: string },
): Promise<void> {
  const secretHash = await hashPassword(input.secret);

  db.prepare(
    `insert into oauth_clients (client_id, secret_hash, role, scopes, description)
     values (?, ?, ?, ?, ?)
     on conflict (client_id) do update set
       secret_hash = excluded.secret_hash,
       role = excluded.role,
       scopes = excluded.scopes,
       description = excluded.description`,
  ).run(input.clientId, secretHash, input.role, input.scopes.join(' '), input.description);
}

export function listClients(db: Db): OAuthClient[] {
  const rows = db.prepare('select * from oauth_clients order by client_id').all() as ClientRow[];
  return rows.map((row) => ({
    clientId: row.client_id,
    role: row.role,
    scopes: row.scopes.split(' ').filter(Boolean),
    description: row.description,
  }));
}

/**
 * Authenticates a client, returning null for both an unknown id and a wrong
 * secret.
 *
 * Same reasoning as the login endpoint: distinguishing the two would let a
 * caller enumerate which client ids exist. A decoy hash keeps the work, and so
 * the timing, roughly equal on both paths.
 */
let decoyHash: string | undefined;

export async function authenticateClient(
  db: Db,
  clientId: string,
  clientSecret: string,
): Promise<OAuthClient | null> {
  const row = db.prepare('select * from oauth_clients where client_id = ?').get(clientId) as
    ClientRow | undefined;

  decoyHash ??= await hashPassword('a-client-secret-that-is-never-correct');
  const ok = await verifyPassword(row?.secret_hash ?? decoyHash, clientSecret);

  if (!row || !ok) return null;

  return {
    clientId: row.client_id,
    role: row.role,
    scopes: row.scopes.split(' ').filter(Boolean),
    description: row.description,
  };
}

/**
 * Narrows a requested scope set to what the client is actually granted.
 *
 * Asking for more than you hold is not an error, it simply gets you less. That
 * follows RFC 6749, and it means a client cannot widen its own authority by
 * asking loudly.
 */
export function grantedScopes(client: OAuthClient, requested: string | undefined): string[] {
  if (!requested) return client.scopes;
  const asked = requested.split(' ').filter(Boolean);
  return asked.filter((scope) => client.scopes.includes(scope));
}

/** Constant-time comparison, for anything compared outside argon2. */
export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
