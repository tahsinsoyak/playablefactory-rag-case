import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { PublicUser, SessionResponse } from '@corpus/shared';
import { API_URL } from './config';

/**
 * Reads the session on the server by forwarding the browser's cookies to the API.
 *
 * Done here rather than in the browser so a protected page never renders and
 * then disappears: an unauthenticated visitor is redirected before any markup is
 * sent. The API remains the actual authority. This is the same `/auth/session`
 * check, run early enough to be useful.
 */
export async function getSession(): Promise<PublicUser | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;

  try {
    const response = await fetch(`${API_URL}/auth/session`, {
      headers: { cookie: cookieHeader },
      // Session state must never be served from a cache.
      cache: 'no-store',
    });

    if (!response.ok) return null;
    const body = (await response.json()) as SessionResponse;
    return body.user;
  } catch {
    // The API being down should look like "signed out", not a crashed page.
    return null;
  }
}

/** Guards a page that any signed-in user may see. */
export async function requireUser(returnTo: string): Promise<PublicUser> {
  const user = await getSession();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

/**
 * Guards an admin-only page.
 *
 * A regular user gets 404, not 403: telling them the dashboard exists but is
 * closed to them is information they have no use for. The API still answers 403
 *. That is a direct request from a client that already knows the endpoint.
 */
export async function requireAdmin(returnTo: string): Promise<PublicUser> {
  const user = await requireUser(returnTo);
  if (user.role !== 'admin') notFound();
  return user;
}
