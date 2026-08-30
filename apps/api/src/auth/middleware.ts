import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { AccessTokenClaims, Role } from '@corpus/shared';
import { forbidden, unauthorized } from '../errors.js';
import { verifyAccessToken } from './tokens.js';

export const ACCESS_COOKIE = 'corpus_access';
export const REFRESH_COOKIE = 'corpus_refresh';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireAuth`. Absent on unauthenticated routes by construction. */
    user?: AccessTokenClaims;
  }
}

/**
 * Reads the access token from the httpOnly cookie, falling back to a bearer
 * header.
 *
 * The cookie serves the browser, where httpOnly is what keeps the token out of
 * reach of any script on the page. The bearer header serves the MCP server and
 * `curl`, which have no cookie jar. Both paths verify identically — the header
 * is a transport convenience, not a second, weaker way in.
 */
function extractToken(request: FastifyRequest): string | null {
  const cookie = request.cookies[ACCESS_COOKIE];
  if (cookie) return cookie;

  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim() || null;

  return null;
}

export function createRequireAuth(accessSecret: string): preHandlerHookHandler {
  return async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
    const token = extractToken(request);
    if (!token) throw unauthorized();

    const claims = await verifyAccessToken(token, accessSecret);
    if (!claims) throw unauthorized('Your session is invalid or has expired.');

    request.user = claims;
  };
}

/**
 * Role check. Registered as a route-level preHandler *after* `requireAuth`, so
 * it can rely on `request.user` being set — but it re-checks rather than
 * assuming, because a route registered with the wrong hook order should fail
 * closed instead of granting access.
 */
export function requireRole(role: Role): preHandlerHookHandler {
  return async function checkRole(request: FastifyRequest, _reply: FastifyReply) {
    const user = request.user;
    if (!user) throw unauthorized();
    if (user.role !== role) throw forbidden();
  };
}
