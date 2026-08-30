import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { accessTokenClaimsSchema, type AccessTokenClaims, type Role } from '@corpus/shared';
import type { Db } from '../db/index.js';

const ISSUER = 'corpus-rag';
const AUDIENCE = 'corpus-rag-api';

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export interface AccessTokenInput {
  userId: string;
  email: string;
  role: Role;
}

export async function signAccessToken(
  input: AccessTokenInput,
  secret: string,
  ttl: string,
): Promise<string> {
  return new SignJWT({ email: input.email, role: input.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(input.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secretKey(secret));
}

/**
 * Verifies signature, expiry, issuer, and audience, then re-validates the claims
 * against the shared schema. The schema check is not redundant: a valid
 * signature only proves we issued the token, not that its shape still matches
 * what the current code expects.
 */
export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });

    const parsed = accessTokenClaimsSchema.safeParse({
      sub: payload.sub,
      email: payload['email'],
      role: payload['role'],
    });

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// --- refresh tokens ---------------------------------------------------------

/**
 * Refresh tokens are opaque random strings, not JWTs. They are checked against
 * the database on every use, so revocation is immediate — a stateless refresh
 * token cannot be withdrawn before it expires.
 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/** Stored hashed, so a database read does not yield usable sessions. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface StoredRefreshToken {
  id: string;
  userId: string;
  expiresAt: string;
  revokedAt: string | null;
  rotatedTo: string | null;
}

export function persistRefreshToken(
  db: Db,
  userId: string,
  token: string,
  expiresAt: Date,
): string {
  const id = randomUUID();
  db.prepare(
    'insert into refresh_tokens (id, user_id, token_hash, expires_at) values (?, ?, ?, ?)',
  ).run(id, userId, hashRefreshToken(token), expiresAt.toISOString());
  return id;
}

export function findRefreshToken(db: Db, token: string): StoredRefreshToken | null {
  const row = db
    .prepare(
      `select id, user_id as userId, expires_at as expiresAt,
              revoked_at as revokedAt, rotated_to as rotatedTo
         from refresh_tokens where token_hash = ?`,
    )
    .get(hashRefreshToken(token)) as StoredRefreshToken | undefined;

  return row ?? null;
}

export function revokeRefreshToken(db: Db, id: string, rotatedTo?: string): void {
  db.prepare(
    "update refresh_tokens set revoked_at = datetime('now'), rotated_to = ? where id = ?",
  ).run(rotatedTo ?? null, id);
}

/**
 * Reuse of an already-rotated token means the token leaked: the legitimate
 * client would have moved on to its replacement. Revoking the user's whole
 * family is the standard response, since we cannot tell attacker from victim.
 */
export function revokeAllUserRefreshTokens(db: Db, userId: string): void {
  db.prepare(
    "update refresh_tokens set revoked_at = datetime('now') where user_id = ? and revoked_at is null",
  ).run(userId);
}

/** Parses `15m` / `7d` / `30s` / `12h` into milliseconds. */
export function parseDuration(ttl: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(ttl.trim());
  if (!match) throw new Error(`Invalid duration: ${ttl}. Use forms like 15m, 12h, 7d.`);

  const value = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return value * multiplier;
}
