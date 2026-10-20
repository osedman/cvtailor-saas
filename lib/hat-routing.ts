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

/**
 * The guard and the landing constants live in lib/auth-paths.ts, which has no
 * server imports, because this module pulls in agencyAdmin (→ next/headers +
 * the service-role key) and a client component importing from here fails the
 * build. Re-exported so every existing importer of this module is unchanged.
 */
export {
  AGENCY_LANDING,
  DEFAULT_LANDING,
  HIRING_LANDING,
  safeNextPath,
} from "@/lib/auth-paths"

import {
  AGENCY_LANDING,
  DEFAULT_LANDING,
  DOOR_FALLBACK,
  HIRING_LANDING,
  safeNextPath,
  type AuthDoor,
} from "@/lib/auth-paths"

/**
 * Resolve the landing path for a just-authenticated user.
 *
 * @param userId  auth.users id of the signed-in person
 * @param requested  the `next` the caller asked for, if any (wins when safe)
 */
export async function resolveLandingPath(
  userId: string | null | undefined,
  requested?: unknown,
  door: AuthDoor = "consumer"
): Promise<string> {
  const explicit = safeNextPath(requested)
  if (explicit) return explicit
  const fallback = DOOR_FALLBACK[door]
  if (!userId) return fallback

  try {
    const admin = agencyAdmin()

    // A recruiter who came through the CONSUMER door keeps the long-standing
    // /tailor default — many of them are consumer users too and that habit
    // predates the split. Through the BUSINESS door the same person asked for
    // the recruiter product by the domain they typed, so send them there.
    const { data: membership } = await admin
      .from("members")
      .select("agency_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle()
    if (membership) return door === "business" ? AGENCY_LANDING : DEFAULT_LANDING

    // A linked client contact with no agency membership is a hiring manager
    // and nothing else — the consumer app is not their product, through
    // either door.
    const { data: link } = await admin
      .from("client_contacts")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle()
    if (link) return HIRING_LANDING

    return fallback
  } catch {
    return fallback
  }
}

/** Which hats a person actually holds. Consumer is not included — it is the
 *  default everyone has, and it is not what the switcher moves between. */
export interface HatsHeld {
  recruiter: boolean
  hiringManager: boolean
}

/**
 * Resolve both agency-side hats in one lookup.
 *
 * This exists because §5.4.1 decided on a "switcher for multi-hat users" and
 * it was never built — with the consequence that a person holding both hats
 * landed on the recruiter dashboard (membership is checked first) and had NO
 * route to /hiring at all, since nothing in the recruiter surface links to
 * it. The two dashboards are both dark and share the `agd-` chrome, so the
 * recruiter workspace read as the hiring-manager one, and clicking a role
 * "took you to the recruiter screen" — because you had never left it.
 *
 * The switcher must render ONLY for someone who genuinely holds both. A
 * recruiter who is not a client contact must not be offered a client view
 * they have no business in, and a hiring manager must never see a door into
 * the recruiter product at all.
 *
 * Never throws: chrome must not be able to break a page.
 */
export async function getHatsHeld(userId: string | null | undefined): Promise<HatsHeld> {
  const none: HatsHeld = { recruiter: false, hiringManager: false }
  if (!userId) return none
  try {
    const admin = agencyAdmin()
    const [{ data: membership }, { data: link }] = await Promise.all([
      admin
        .from("members")
        .select("agency_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
      admin
        .from("client_contacts")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
    ])
    return { recruiter: Boolean(membership), hiringManager: Boolean(link) }
  } catch {
    return none
  }
}
