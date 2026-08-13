/**
 * Where a person lands after signing in, when they did not ask for anywhere.
 *
 * One auth pool, several hats (docs/AGENCIES_SCHEMA.md §5.4): the same
 * auth.users row can be a consumer (public.profiles), a recruiter
 * (agency.members) and a hiring manager (a linked agency.client_contacts).
 * An explicit `next` always wins — this only decides the default.
 *
 * Deliberately conservative: the ONLY behaviour this changes is for someone
 * who is a linked client contact and is NOT an agency member. Before the
 * hiring workspace existed, that person landed in the consumer app, which is
 * the one product they were not invited to use. Everyone else — consumers,
 * recruiters, multi-hat people — keeps the long-standing /tailor default,
 * because changing where an existing user lands is not this feature's job.
 *
 * Never throws. A failure here must not break an authentication redirect, so
 * every error path falls back to the old default.
 */

import { agencyAdmin } from "@/lib/agency/db"

export const DEFAULT_LANDING = "/tailor"
export const HIRING_LANDING = "/hiring"

/** Same-origin relative paths only — an open redirect here would be handed a
 * freshly-minted session, so this is the strictest check in the flow.
 *
 * The backslash cases are not paranoia: browsers normalise `\` to `/` in URLs,
 * so `/\evil.example.com` and `/\/evil.example.com` are read as
 * protocol-relative and navigate off-origin exactly like `//evil.example.com`.
 * Any backslash is rejected outright — no legitimate route in this app has one. */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const next = raw.trim()
  if (!next.startsWith("/") || next.startsWith("//")) return null
  if (next.includes("\\")) return null
  if (next.includes("://")) return null
  if (next.length > 512) return null
  return next
}

/**
 * Resolve the landing path for a just-authenticated user.
 *
 * @param userId  auth.users id of the signed-in person
 * @param requested  the `next` the caller asked for, if any (wins when safe)
 */
export async function resolveLandingPath(
  userId: string | null | undefined,
  requested?: unknown
): Promise<string> {
  const explicit = safeNextPath(requested)
  if (explicit) return explicit
  if (!userId) return DEFAULT_LANDING

  try {
    const admin = agencyAdmin()

    // A recruiter keeps the existing default: they already have a working
    // habit, and many of them are consumer users too.
    const { data: membership } = await admin
      .from("members")
      .select("agency_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle()
    if (membership) return DEFAULT_LANDING

    // A linked client contact with no agency membership is a hiring manager
    // and nothing else — the consumer app is not their product.
    const { data: link } = await admin
      .from("client_contacts")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle()
    if (link) return HIRING_LANDING

    return DEFAULT_LANDING
  } catch {
    return DEFAULT_LANDING
  }
}
