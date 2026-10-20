/**
 * The signed-in person, from the session token's verified claims
 * (30 Sep 2026).
 *
 * `auth.getUser()` is a network round trip to Supabase Auth, and every API
 * route paid it — after the proxy had already paid it for the same request.
 * `getClaims()` verifies the token's signature locally against the project's
 * cached public keys, and falls back to `getUser()` by itself for a project
 * that signs with a shared secret, so it is never slower and never less
 * checked. It does not see a session revoked in the last hour; the token's
 * own expiry bounds that.
 *
 * Only `id` and `email` are returned because they are all the routes read.
 * Sign-in routes that need the full user row (post-login, landing, invite
 * accept) keep `getUser()` on purpose: they run once, at the moment identity
 * is being established.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export interface SessionUser {
  id: string
  email: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sessionUser(client: { auth: SupabaseClient<any, any, any>["auth"] }): Promise<SessionUser | null> {
  const { data } = await client.auth.getClaims()
  const claims = data?.claims
  if (!claims || typeof claims.sub !== "string" || !claims.sub) return null
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null }
}
