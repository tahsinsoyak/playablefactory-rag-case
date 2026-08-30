import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import type { InjectPayload } from 'light-my-request';
import { ACCESS_COOKIE } from '../auth/middleware.js';
import { TEST_ADMIN, TEST_USER, buildTestApp, loginCookie, type TestApp } from '../test-support.js';

/**
 * Every route that must not be reachable by a regular user.
 *
 * Written as a table rather than a test each, so adding a route to the API and
 * forgetting to add it here is a visible omission in one place. A protection
 * that is only asserted for the one endpoint someone remembered to test is not
 * really asserted at all.
 */
const ADMIN_ROUTES: { method: 'GET' | 'POST' | 'PATCH'; url: string; payload?: InjectPayload }[] = [
  { method: 'GET', url: '/documents' },
  { method: 'GET', url: '/documents/00000000-0000-4000-8000-000000000000' },
  { method: 'GET', url: '/ingestion/runs' },
  { method: 'POST', url: '/ingestion/run', payload: {} },
  { method: 'GET', url: '/index/health' },
  { method: 'GET', url: '/analytics/search' },
  { method: 'GET', url: '/admin/users' },
  {
    method: 'PATCH',
    url: '/admin/users/00000000-0000-4000-8000-000000000000/role',
    payload: { role: 'admin' },
  },
];

/** Routes any signed-in user may reach, but an anonymous caller may not. */
const AUTHENTICATED_ROUTES: { method: 'POST'; url: string; payload: InjectPayload }[] = [
  { method: 'POST', url: '/search', payload: { query: 'anything', limit: 3, mode: 'hybrid' } },
  { method: 'POST', url: '/answer', payload: { question: 'anything', mode: 'hybrid', topK: 3 } },
];

let harness: TestApp;
let app: FastifyInstance;
let userCookie: string;
let adminCookie: string;

before(async () => {
  harness = await buildTestApp();
  app = harness.app;

  userCookie = await loginCookie(app, TEST_USER.email, TEST_USER.password);
  adminCookie = await loginCookie(app, TEST_ADMIN.email, TEST_ADMIN.password);
});

after(async () => {
  await harness.close();
});

describe('admin routes', () => {
  for (const route of ADMIN_ROUTES) {
    it(`refuses ${route.method} ${route.url} to an anonymous caller`, async () => {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        ...(route.payload ? { payload: route.payload } : {}),
      });

      assert.equal(response.statusCode, 401, 'must require authentication');
    });

    it(`refuses ${route.method} ${route.url} to a regular user`, async () => {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        cookies: { [ACCESS_COOKIE]: userCookie },
        ...(route.payload ? { payload: route.payload } : {}),
      });

      assert.equal(response.statusCode, 403, 'a regular user must not reach an admin route');
      assert.equal(response.json().error.code, 'forbidden');
    });
  }

  it('lets an admin through to a route a regular user was refused', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/index/health',
      cookies: { [ACCESS_COOKIE]: adminCookie },
    });

    // Proves the 403s above come from the role check and not from the route
    // being broken for everyone.
    assert.equal(response.statusCode, 200);
  });
});

describe('authenticated routes', () => {
  for (const route of AUTHENTICATED_ROUTES) {
    it(`refuses ${route.method} ${route.url} to an anonymous caller`, async () => {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        payload: route.payload,
      });

      assert.equal(response.statusCode, 401);
    });
  }

  it('allows a regular user to search', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/search',
      cookies: { [ACCESS_COOKIE]: userCookie },
      payload: { query: 'applovin file size', limit: 3, mode: 'keyword' },
    });

    // Keyword mode so the test needs no embedding model. The index is empty in
    // this fixture, so the point is that the request is authorised and answered,
    // not what it found.
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().hits, []);
  });
});

describe('input validation', () => {
  it('rejects a search with no query', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/search',
      cookies: { [ACCESS_COOKIE]: userCookie },
      payload: { query: '' },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, 'bad_request');
  });

  it('rejects keyword mode for answers, which cannot be relevance-gated', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/answer',
      cookies: { [ACCESS_COOKIE]: userCookie },
      payload: { question: 'anything', mode: 'keyword' },
    });

    assert.equal(response.statusCode, 400, 'BM25 has no calibrated score to threshold on');
  });

  it('refuses to let an admin drop their own admin role', async () => {
    const listed = await app.inject({
      method: 'GET',
      url: '/admin/users',
      cookies: { [ACCESS_COOKIE]: adminCookie },
    });
    const admin = (listed.json().users as { id: string; role: string }[]).find(
      (u) => u.role === 'admin',
    );
    assert.ok(admin, 'expected a seeded admin');

    const response = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${admin.id}/role`,
      cookies: { [ACCESS_COOKIE]: adminCookie },
      payload: { role: 'user' },
    });

    // Otherwise the last admin can lock everyone out of the dashboard with no
    // route back in through the UI.
    assert.equal(response.statusCode, 400);
  });
});
