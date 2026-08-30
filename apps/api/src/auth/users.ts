import { randomUUID } from 'node:crypto';
import type { PublicUser, Role } from '@corpus/shared';
import type { Db } from '../db/index.js';
import { hashPassword } from './passwords.js';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: string;
}

/** SQLite stores `datetime('now')` as `YYYY-MM-DD HH:MM:SS`; the API contract wants ISO 8601. */
function toIso(sqliteDate: string): string {
  return new Date(`${sqliteDate.replace(' ', 'T')}Z`).toISOString();
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: toIso(row.created_at),
  };
}

export function findUserByEmail(db: Db, email: string): UserRow | null {
  const row = db.prepare('select * from users where email = ?').get(email) as UserRow | undefined;
  return row ?? null;
}

export function findUserById(db: Db, id: string): PublicUser | null {
  const row = db.prepare('select * from users where id = ?').get(id) as UserRow | undefined;
  return row ? toPublicUser(row) : null;
}

export function listUsers(db: Db): PublicUser[] {
  const rows = db.prepare('select * from users order by created_at asc').all() as UserRow[];
  return rows.map(toPublicUser);
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: Role;
}

export async function createUser(db: Db, input: CreateUserInput): Promise<PublicUser> {
  const id = randomUUID();
  const passwordHash = await hashPassword(input.password);

  db.prepare('insert into users (id, email, password_hash, role) values (?, ?, ?, ?)').run(
    id,
    input.email.toLowerCase(),
    passwordHash,
    input.role,
  );

  const created = findUserById(db, id);
  if (!created) throw new Error('User insert succeeded but the row could not be read back.');
  return created;
}

/** Idempotent, for seeding: updates the password and role of an existing account. */
export async function upsertUser(db: Db, input: CreateUserInput): Promise<PublicUser> {
  const existing = findUserByEmail(db, input.email);
  if (!existing) return createUser(db, input);

  const passwordHash = await hashPassword(input.password);
  db.prepare('update users set password_hash = ?, role = ? where id = ?').run(
    passwordHash,
    input.role,
    existing.id,
  );

  const updated = findUserById(db, existing.id);
  if (!updated) throw new Error('User update succeeded but the row could not be read back.');
  return updated;
}

export function updateUserRole(db: Db, id: string, role: Role): PublicUser | null {
  const result = db.prepare('update users set role = ? where id = ?').run(role, id);
  return result.changes > 0 ? findUserById(db, id) : null;
}
