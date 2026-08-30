import { z } from 'zod';

/**
 * What the MCP integration page needs to describe the server.
 *
 * Deliberately carries no client secret. The page shows how to connect and can
 * run a live check, but the credential that authorises a real client stays on
 * the server, where it already lives argon2-hashed.
 */
export const mcpTransportStatusSchema = z.object({
  transport: z.enum(['stdio', 'http']),
  /** Whether the transport is currently reachable. stdio is launched per client, so it reports 'not_applicable'. */
  reachable: z.enum(['up', 'down', 'not_applicable']),
  detail: z.string(),
});
export type McpTransportStatus = z.infer<typeof mcpTransportStatusSchema>;

export const mcpStatusSchema = z.object({
  toolName: z.string(),
  /** The stdio command a desktop client should launch. */
  stdioCommand: z.string(),
  stdioArgs: z.array(z.string()),
  httpEndpoint: z.string(),
  /** OIDC issuer whose tokens the HTTP transport accepts. */
  issuer: z.string(),
  /** RFC 8707 resource indicator: the audience tokens must carry. */
  resource: z.string(),
  scopes: z.array(z.string()),
  clientId: z.string(),
  /** True when an OAuth client has actually been registered by the seed. */
  clientRegistered: z.boolean(),
  transports: z.array(mcpTransportStatusSchema),
  indexedDocuments: z.number().int().nonnegative(),
});
export type McpStatus = z.infer<typeof mcpStatusSchema>;

export const mcpTryRequestSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(10).default(3),
});
export type McpTryRequest = z.infer<typeof mcpTryRequestSchema>;

export const mcpTryHitSchema = z.object({
  path: z.string(),
  title: z.string(),
  heading: z.string().nullable(),
  similarity: z.number().nullable(),
});
export type McpTryHit = z.infer<typeof mcpTryHitSchema>;

/**
 * The result of exercising the real MCP endpoint over HTTP.
 *
 * `steps` is the point of this: it records the token request and the tool call
 * separately, so a failure says which half broke rather than just "it did not
 * work".
 */
export const mcpTryResponseSchema = z.object({
  ok: z.boolean(),
  steps: z.array(
    z.object({
      name: z.string(),
      ok: z.boolean(),
      detail: z.string(),
      durationMs: z.number().nonnegative(),
    }),
  ),
  hits: z.array(mcpTryHitSchema),
  /** The text block an MCP client would actually receive. */
  text: z.string(),
});
export type McpTryResponse = z.infer<typeof mcpTryResponseSchema>;
