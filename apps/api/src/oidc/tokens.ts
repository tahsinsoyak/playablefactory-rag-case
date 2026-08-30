import { SignJWT, jwtVerify, createLocalJWKSet, type JWK } from 'jose';
import type { Role } from '@corpus/shared';
import type { SigningKey } from './keys.js';

/** The scope an MCP client needs to call the search tool. */
export const SEARCH_SCOPE = 'corpus:search';

export interface AccessTokenRequest {
  /** The OAuth client the token is issued to. */
  clientId: string;
  /** Subject: the client itself for machine tokens, a user id when acting for one. */
  subject: string;
  role: Role;
  scopes: string[];
  /** RFC 8707 resource indicator: the MCP server this token is valid for. */
  audience: string;
  issuer: string;
  expiresInSeconds: number;
}

/**
 * Issues an RS256 access token for a resource server.
 *
 * `aud` is the point of interest. RFC 8707 resource indicators mean a token
 * minted for the MCP server is only valid there: if it leaks, it cannot be
 * replayed against the main API, because that audience check fails. Tokens are
 * short-lived for the same reason, and there is no refresh token here on
 * purpose, since a machine client can simply ask for another one.
 */
export async function issueAccessToken(
  key: SigningKey,
  req: AccessTokenRequest,
): Promise<{ accessToken: string; expiresIn: number }> {
  const accessToken = await new SignJWT({
    scope: req.scopes.join(' '),
    role: req.role,
    client_id: req.clientId,
  })
    .setProtectedHeader({ alg: key.algorithm, kid: key.keyId, typ: 'at+jwt' })
    .setSubject(req.subject)
    .setIssuer(req.issuer)
    .setAudience(req.audience)
    .setIssuedAt()
    .setExpirationTime(`${req.expiresInSeconds}s`)
    .sign(key.privateKey);

  return { accessToken, expiresIn: req.expiresInSeconds };
}

export interface VerifiedAccessToken {
  subject: string;
  clientId: string;
  role: Role;
  scopes: string[];
  audience: string;
  expiresAt: number;
}

export interface VerifyOptions {
  jwks: { keys: JWK[] };
  issuer: string;
  audience: string;
  requiredScopes?: string[];
}

/**
 * Verifies an access token against a JWKS.
 *
 * Checks signature, issuer, audience, and expiry, then the scopes. Every one of
 * those is a separate way a token can be valid-looking and still wrong: signed
 * by someone else, issued by another provider, minted for a different resource,
 * expired, or simply not granted the permission being exercised.
 */
export async function verifyAccessToken(
  token: string,
  options: VerifyOptions,
): Promise<VerifiedAccessToken> {
  const { payload } = await jwtVerify(token, createLocalJWKSet(options.jwks), {
    issuer: options.issuer,
    audience: options.audience,
    algorithms: ['RS256'],
  });

  const scopes = typeof payload['scope'] === 'string' ? payload['scope'].split(' ') : [];

  for (const required of options.requiredScopes ?? []) {
    if (!scopes.includes(required)) {
      throw new Error(`Token is missing the required scope "${required}".`);
    }
  }

  if (!payload.sub || !payload.exp) {
    throw new Error('Token is missing sub or exp.');
  }

  return {
    subject: payload.sub,
    clientId: (payload['client_id'] as string | undefined) ?? 'unknown',
    role: (payload['role'] as Role | undefined) ?? 'user',
    scopes,
    audience: options.audience,
    expiresAt: payload.exp,
  };
}
