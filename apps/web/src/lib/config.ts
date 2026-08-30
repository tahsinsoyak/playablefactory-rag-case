/**
 * The API base URL. Public because the browser calls the API directly - there is
 * no proxy layer, so the value has to be baked into the client bundle.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
