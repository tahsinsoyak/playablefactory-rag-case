import type { ApiError } from '@corpus/shared';
import { API_URL } from './config';

/** A failed API call, carrying the code the server chose so callers can branch. */
export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * Browser-side API client.
 *
 * `credentials: 'include'` is what carries the httpOnly session cookie. The web
 * app and API sit on different ports of localhost - cross-origin, but same-site,
 * so a SameSite=Lax cookie is still sent.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  } catch {
    throw new ApiRequestError(
      'network',
      'Could not reach the API. Is it running on ' + API_URL + '?',
      0,
    );
  }

  if (!response.ok) {
    let code = 'internal';
    let message: string;

    try {
      const body = (await response.json()) as ApiError;
      code = body.error.code;
      message = body.error.message;
    } catch {
      // A non-JSON error body (a proxy's HTML 502, say) still has a status.
      message = `Request failed with status ${response.status}.`;
    }

    throw new ApiRequestError(code, message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
