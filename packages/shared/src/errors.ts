import { z } from 'zod';

/**
 * One error shape for every endpoint, so the client has exactly one thing to
 * handle. `code` is what clients branch on; `message` is what humans read.
 */
export const apiErrorCodeSchema = z.enum([
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'upstream_unavailable',
  'internal',
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    /** Field-level validation detail, present only for `bad_request`. */
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const httpStatusByErrorCode: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  upstream_unavailable: 503,
  internal: 500,
};
