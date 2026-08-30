import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { openDatabase, runMigrations, corpusMigrations, type Db } from '@corpus/rag';
import { apiMigrations } from '../db/schema.js';
import { buildServer } from '../server.js';
import { createUser } from './users.js';
import type { Config } from '../config.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './middleware.js';

const TEST_CONFIG: Config = {
  NODE_ENV: 'test',
  API_PORT: 0,
  WEB_ORIGIN: 'http://localhost:3000',
  DATABASE_PATH: ':memory:',
  CORPUS_DIR: './corpus',
  EMBEDDER: 'local:bge-small-en-v1.5',
  MODEL_CACHE_DIR: './.models',
  LLM_PROVIDER: 'anthropic',
  LLM_MODEL: 'claude-opus-5',
  JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough',
  JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough',
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL: '7d',
};

const USER = { email: 'user@test.local', password: 'user-password', role: 'user' as const };
const ADMIN = { email: 'admin@test.local', password: 'admin-password', role: 'admin' as const };

let app: FastifyInstance;
let db: Db;

/** Pulls one cookie value out of a login response's `set-cookie` headers. */
function cookieFrom(response: { headers: Record<string, unknown> }, name: string): string {
  const raw = response.headers['set-cookie'];
  const all = Array.isArray(raw) ? raw : [raw];
  const match = all.find((c): c is string => typeof c === 'string' && c.startsWith(`${name}=`));
  assert.ok(match, `expected a ${name} cookie`);
  return match.split(';')[0]!.split('=').slice(1).join('=');
}

async function login(email: string, password: string) {
  return app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
}

before(async () => {
  db = openDatabase({ path: ':memory:' });
  runMigrations(db, [...corpusMigrations, ...apiMigrations]);
  await createUser(db, USER);
  await createUser(db, ADMIN);
  app = await buildServer({ db, config: TEST_CONFIG });
});

after(async () => {
  await app.close();
  db.close();
});

describe('authentication', () => {
  it('rejects a wrong password', async () => {
    const res = await login(USER.email, 'not-the-password');
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error.code, 'unauthorized');
  });

  it('gives the same answer for an unknown address as for a wrong password', async () => {
    const unknown = await login('nobody@test.local', 'whatever-password');
    const wrong = await login(USER.email, 'not-the-password');

    // Identical bodies: the endpoint must not reveal which accounts exist.
    assert.equal(unknown.statusCode, wrong.statusCode);
    assert.deepEqual(unknown.json(), wrong.json());
  });

  it('accepts valid credentials and sets httpOnly cookies', async () => {
    const res = await login(USER.email, USER.password);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().user.email, USER.email);
    assert.equal(res.json().user.role, 'user');

    const cookies = res.headers['set-cookie'] as string[];
    const access = cookies.find((c) => c.startsWith(ACCESS_COOKIE));
    const refresh = cookies.find((c) => c.startsWith(REFRESH_COOKIE));

    assert.ok(access?.includes('HttpOnly'), 'access cookie must be httpOnly');
    assert.ok(refresh?.includes('HttpOnly'), 'refresh cookie must be httpOnly');
    // Scoped to /auth so the long-lived credential is not sent with every request.
    assert.ok(refresh?.includes('Path=/auth'), 'refresh cookie must be scoped to /auth');
  });

  it('never returns the password hash', async () => {
    const res = await login(USER.email, USER.password);
    assert.equal(res.statusCode, 200);
    assert.ok(!JSON.stringify(res.json()).includes('$argon2'), 'response leaked a password hash');
  });

  it('reports an anonymous session as null rather than as an error', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/session' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().user, null);
  });
});

describe('authorization', () => {
  it('refuses the admin route to an anonymous caller', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/users' });
    assert.equal(res.statusCode, 401);
  });

  it('refuses the admin route to a signed-in regular user', async () => {
    const session = await login(USER.email, USER.password);
    const access = cookieFrom(session, ACCESS_COOKIE);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      cookies: { [ACCESS_COOKIE]: access },
    });

    assert.equal(res.statusCode, 403, 'a regular user must not reach an admin route');
    assert.equal(res.json().error.code, 'forbidden');
  });

  it('allows the admin route to an admin', async () => {
    const session = await login(ADMIN.email, ADMIN.password);
    const access = cookieFrom(session, ACCESS_COOKIE);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      cookies: { [ACCESS_COOKIE]: access },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.json().users.length, 2);
  });

  it('refuses a token signed with the wrong secret', async () => {
    const { signAccessToken } = await import('./tokens.js');
    const forged = await signAccessToken(
      { userId: '00000000-0000-4000-8000-000000000000', email: ADMIN.email, role: 'admin' },
      'a-different-secret-entirely-here',
      '15m',
    );

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      cookies: { [ACCESS_COOKIE]: forged },
    });

    assert.equal(res.statusCode, 401);
  });
});

describe('refresh token rotation', () => {
  it('rotates the refresh token and revokes the old one on reuse', async () => {
    const session = await login(USER.email, USER.password);
    const firstRefresh = cookieFrom(session, REFRESH_COOKIE);

    const rotated = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { [REFRESH_COOKIE]: firstRefresh },
    });
    assert.equal(rotated.statusCode, 200);

    const secondRefresh = cookieFrom(rotated, REFRESH_COOKIE);
    assert.notEqual(secondRefresh, firstRefresh, 'refresh token must rotate');

    // Replaying the consumed token is treated as a leak, not merely as invalid.
    const replay = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { [REFRESH_COOKIE]: firstRefresh },
    });
    assert.equal(replay.statusCode, 401);

    // ...and the whole family dies with it, including the token the honest
    // client is holding.
    const afterBreach = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { [REFRESH_COOKIE]: secondRefresh },
    });
    assert.equal(afterBreach.statusCode, 401, 'reuse must end every session for that user');
  });
});
