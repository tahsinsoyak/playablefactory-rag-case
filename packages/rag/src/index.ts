/**
 * The retrieval core. `apps/api` and `apps/mcp` are thin transports over this
 * package — neither of them knows what an embedding is, which is what keeps the
 * MCP tool and the web search from drifting into two implementations.
 */

export * from './ports/index.js';
export * from './store/database.js';
export * from './store/migrate.js';
export * from './store/schema.js';
export * from './store/sqlite-store.js';
export * from './corpus/loader.js';
export * from './chunking/chunker.js';
export * from './embedding/index.js';
export * from './ingest/ingest.js';
export * from './retrieval/retriever.js';
export * from './generation/index.js';
