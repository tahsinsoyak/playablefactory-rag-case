/**
 * The retrieval core. `apps/api` and `apps/mcp` are thin transports over this
 * package — neither of them knows what an embedding is, which is what keeps the
 * MCP tool and the web search from drifting into two implementations.
 */

export * from './ports/index.js';
export * from './store/database.js';
export * from './store/migrate.js';
export * from './store/schema.js';
