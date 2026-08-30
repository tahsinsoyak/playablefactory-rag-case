/**
 * The API contract.
 *
 * Every request and response shape that crosses the frontend/backend boundary is
 * defined here once as a zod schema, and the TypeScript types are inferred from it.
 * The API validates with these schemas; the web app and MCP server type against the
 * inferred types. There is no second definition to drift.
 */

export * from './auth.js';
export * from './documents.js';
export * from './search.js';
export * from './answer.js';
export * from './errors.js';
