/**
 * The API base URL. Public because the browser calls the API directly - there is
 * no proxy layer, so the value has to be baked into the client bundle.
 *
 * Demo account credentials deliberately do NOT live here. They are fetched from
 * the API, which returns none in production, so no build of this app ever
 * contains a password.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
