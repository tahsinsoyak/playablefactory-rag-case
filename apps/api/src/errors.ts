import { httpStatusByErrorCode, type ApiErrorCode } from '@corpus/shared';

/**
 * Every failure the API reports on purpose is one of these. Anything else that
 * reaches the error handler is a bug, and is reported as `internal` with the
 * detail logged rather than returned.
 */
export class HttpError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: { path: string; message: string }[] | undefined;

  constructor(code: ApiErrorCode, message: string, details?: { path: string; message: string }[]) {
    super(message);
    this.name = 'HttpError';
    this.code = code;
    this.status = httpStatusByErrorCode[code];
    this.details = details;
  }
}

export const badRequest = (message: string, details?: { path: string; message: string }[]) =>
  new HttpError('bad_request', message, details);

/**
 * One message for "no such user" and "wrong password" alike. Distinguishing them
 * turns the login endpoint into an account-enumeration oracle.
 */
export const unauthorized = (message = 'Authentication required.') =>
  new HttpError('unauthorized', message);

export const forbidden = (message = 'You do not have access to this resource.') =>
  new HttpError('forbidden', message);

export const notFound = (message = 'Not found.') => new HttpError('not_found', message);

export const upstreamUnavailable = (message: string) =>
  new HttpError('upstream_unavailable', message);
