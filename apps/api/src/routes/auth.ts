import type { FastifyInstance } from 'fastify';
import {
  loginRequestSchema,
  type DemoAccountsResponse,
  type LoginResponse,
  type SessionResponse,
} from '@corpus/shared';
import type { AppContext } from '../context.js';
import { badRequest, unauthorized } from '../errors.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../auth/middleware.js';
import { findUserByEmail, findUserById } from '../auth/users.js';
import { verifyPassword, hashPassword } from '../auth/passwords.js';
import {
  findRefreshToken,
  generateRefreshToken,
  parseDuration,
  persistRefreshToken,
  revokeAllUserRefreshTokens,
  revokeRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from '../auth/tokens.js';

/**
 * A hash of a throwaway password, computed once at startup. Used to spend the
 * same work verifying a login for an address that does not exist as for one that
 * does — otherwise response timing distinguishes real accounts from fake ones.
 */
let decoyHash: string | undefined;
async function getDecoyHash(): Promise<string> {
  decoyHash ??= await hashPassword('a-password-that-is-never-correct');
  return decoyHash;
}

export async function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db, config } = ctx;
  const secure = config.NODE_ENV === 'production';

  const accessCookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: Math.floor(parseDuration(config.ACCESS_TOKEN_TTL) / 1000),
  };

  const refreshCookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    // Scoped to the refresh endpoint, so the long-lived credential is not
    // attached to every ordinary API request.
    path: '/auth',
    maxAge: Math.floor(parseDuration(config.REFRESH_TOKEN_TTL) / 1000),
  };

  async function issueSession(
    userId: string,
    email: string,
    role: 'user' | 'admin',
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await signAccessToken(
      { userId, email, role },
      config.JWT_ACCESS_SECRET,
      config.ACCESS_TOKEN_TTL,
    );

    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + parseDuration(config.REFRESH_TOKEN_TTL));
    persistRefreshToken(db, userId, refreshToken, expiresAt);

    return { accessToken, refreshToken };
  }

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(
        'Invalid credentials payload.',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }

    const user = findUserByEmail(db, parsed.data.email.toLowerCase());

    // Always verify against *something*, so the no-such-user path costs the same
    // as the wrong-password path.
    const hashToCheck = user?.password_hash ?? (await getDecoyHash());
    const passwordOk = await verifyPassword(hashToCheck, parsed.data.password);

    if (!user || !passwordOk) {
      throw unauthorized('Incorrect email or password.');
    }

    const { accessToken, refreshToken } = await issueSession(user.id, user.email, user.role);

    reply.setCookie(ACCESS_COOKIE, accessToken, accessCookieOptions);
    reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);

    const publicUser = findUserById(db, user.id);
    if (!publicUser) throw unauthorized();

    const body: LoginResponse = { user: publicUser };
    return body;
  });

  app.post('/auth/refresh', async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE];
    if (!token) throw unauthorized('No refresh token.');

    const stored = findRefreshToken(db, token);
    if (!stored) throw unauthorized('Invalid refresh token.');

    // Presenting a token that was already rotated means it leaked: the honest
    // client is holding its replacement. We cannot tell which caller is which,
    // so we end every session for that user.
    if (stored.rotatedTo !== null) {
      revokeAllUserRefreshTokens(db, stored.userId);
      reply.clearCookie(ACCESS_COOKIE, { path: '/' });
      reply.clearCookie(REFRESH_COOKIE, { path: '/auth' });
      throw unauthorized('Refresh token reuse detected. All sessions have been ended.');
    }

    if (stored.revokedAt !== null) throw unauthorized('Refresh token has been revoked.');
    if (new Date(stored.expiresAt) <= new Date()) throw unauthorized('Refresh token has expired.');

    const user = findUserById(db, stored.userId);
    if (!user) throw unauthorized();

    const { accessToken, refreshToken } = await issueSession(user.id, user.email, user.role);
    const replacement = findRefreshToken(db, refreshToken);
    revokeRefreshToken(db, stored.id, replacement?.id);

    reply.setCookie(ACCESS_COOKIE, accessToken, accessCookieOptions);
    reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);

    const body: LoginResponse = { user };
    return body;
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE];
    if (token) {
      const stored = findRefreshToken(db, token);
      if (stored) revokeRefreshToken(db, stored.id);
    }

    reply.clearCookie(ACCESS_COOKIE, { path: '/' });
    reply.clearCookie(REFRESH_COOKIE, { path: '/auth' });
    return { ok: true };
  });

  /**
   * Who am I. Returns `{ user: null }` rather than 401 for an anonymous caller:
   * the web app asks this on every page load to decide what to render, and a
   * signed-out visitor is a normal answer, not an error.
   */
  app.get('/auth/session', async (request) => {
    const cookie = request.cookies[ACCESS_COOKIE];
    const header = request.headers.authorization;
    const token = cookie ?? (header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined);

    if (!token) {
      const body: SessionResponse = { user: null };
      return body;
    }

    const claims = await verifyAccessToken(token, config.JWT_ACCESS_SECRET);
    const body: SessionResponse = { user: claims ? findUserById(db, claims.sub) : null };
    return body;
  });

  /**
   * The seeded demo accounts, for the login page's one-click buttons.
   *
   * Returns an empty list in production, unconditionally. Gating this on the
   * server rather than in the client is the point: a client-side flag still
   * ships the credentials inside the JavaScript bundle, where anyone can read
   * them whether the buttons render or not. Here a production build sends
   * nothing, because there is nothing to send.
   *
   * The values come from the same environment the seed script reads, so the
   * buttons cannot drift from the accounts that actually exist.
   */
  app.get('/auth/demo-accounts', async () => {
    if (config.NODE_ENV === 'production') {
      const empty: DemoAccountsResponse = { accounts: [] };
      return empty;
    }

    const body: DemoAccountsResponse = {
      accounts: [
        {
          role: 'user',
          email: process.env['SEED_USER_EMAIL'] ?? 'user@demo.local',
          password: process.env['SEED_USER_PASSWORD'] ?? 'demo-user-pw',
          description: 'Chat and search only',
        },
        {
          role: 'admin',
          email: process.env['SEED_ADMIN_EMAIL'] ?? 'admin@demo.local',
          password: process.env['SEED_ADMIN_PASSWORD'] ?? 'demo-admin-pw',
          description: 'Adds the dashboard and ingestion',
        },
      ],
    };
    return body;
  });
}
