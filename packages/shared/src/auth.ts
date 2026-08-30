import { z } from 'zod';

/**
 * Roles are ordered by privilege. `admin` may do everything `user` may do, plus
 * manage the corpus and read the dashboard.
 */
export const roleSchema = z.enum(['user', 'admin']);
export type Role = z.infer<typeof roleSchema>;

export const loginRequestSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * What the client is allowed to know about the signed-in user. Deliberately does
 * not carry the password hash or the refresh token, the access token lives in an
 * httpOnly cookie the browser cannot read.
 */
export const publicUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: roleSchema,
  createdAt: z.iso.datetime(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const loginResponseSchema = z.object({
  user: publicUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const sessionResponseSchema = z.object({
  user: publicUserSchema.nullable(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/** Claims carried by the access token. Kept small: it travels on every request. */
export const accessTokenClaimsSchema = z.object({
  sub: z.uuid(),
  email: z.email(),
  role: roleSchema,
});
export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;

/**
 * Seeded demo accounts, offered by the API for one-click sign-in.
 *
 * Served by the server rather than compiled into the web bundle, so a
 * production build ships no credentials at all - and so the values cannot drift
 * from what `npm run seed` actually created, because both read the same
 * environment.
 */
export const demoAccountSchema = z.object({
  role: roleSchema,
  email: z.email(),
  password: z.string(),
  description: z.string(),
});
export type DemoAccount = z.infer<typeof demoAccountSchema>;

export const demoAccountsResponseSchema = z.object({
  accounts: z.array(demoAccountSchema),
});
export type DemoAccountsResponse = z.infer<typeof demoAccountsResponseSchema>;
