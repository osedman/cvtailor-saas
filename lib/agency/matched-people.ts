/**
 * The matched list: Tailr users who match a published role AND chose to be
 * seen — and the one thing a recruiter can do about it.
 *
 * THE WALL, RESTATED. Until 5 Sep 2026 the recruiter saw a rounded bucket
 * and nobody. Ose's call: show the list. It is lawful only because of a
 * third consumer switch, `discoverable`, that is off by default and is the
 * consent for the LISTING alone. So:
 *
 * - The list comes from one service-role RPC, agency.matched_people, which
 *   joins the recommendation to the opt-in in the database. A person with
 *   the switch off is not filtered out of a result here; they are never in
 *   the result. Turn it off and every list loses them at once, because
 *   nothing is snapshotted.
 * - A row is the projection they consented to: name, headline, band, the
 *   frozen evidence map. No CV, no email, no other roles.
 * - The one action is Invite to apply. It marks the recommendation
 *   `invited` so their /found card says a recruiter asked. The CV, the
 *   contact details and the candidate row on the role still arrive only
 *   when they apply. Applying remains the consent for the file.
 * - People who match but did not opt in stay in the bucket, as before.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { agencyAdmin, assertWriter, writeAudit, AgencyAccessError } from "./db"
import type { AgencyContext } from "./types"
import { matchBand, type MatchBand } from "./match-bands"

export interface MatchedPerson {
  recommendationId: string
  name: string
  headline: string
  band: MatchBand
  evidence: Array<{ requirement_ref: string; strength: string; quote: string | null }>
  /** 'new' | 'seen' | 'invited' | 'applied' — never 'dismissed', the RPC drops those. */
  state: string
  invitedAt: string | null
  appliedAt: string | null
}

export interface MatchedList {
  people: MatchedPerson[]
  /** The rounded count of everyone who matched, discoverable or not — the bucket as before. */
  bucket: "none" | "fewer_than_5" | "5_to_20" | "over_20"
}

export async function listMatchedPeople(ctx: AgencyContext, roleId: string): Promise<MatchedList> {
  const admin = agencyAdmin()
  const { data: rm } = await admin.from("role_matching").select("matched_bucket").eq("agency_id", ctx.agencyId).eq("role_id", roleId).maybeSingle()
  const { data, error } = await admin.rpc("matched_people", { p_role_id: roleId })
  if (error) throw error
  const people = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    recommendationId: String(r.recommendation_id),
    name: (r.full_name as string) || "A Tailr user",
    headline: (r.headline as string) || "",
    band: matchBand(Number(r.score)),
    evidence: Array.isArray(r.evidence) ? (r.evidence as MatchedPerson["evidence"]) : [],
    state: String(r.state),
    invitedAt: (r.invited_at as string | null) ?? null,
    appliedAt: (r.applied_at as string | null) ?? null,
  }))
  return { people, bucket: ((rm?.matched_bucket as MatchedList["bucket"]) ?? "none") }
}

/** Invite one matched person to apply. Audited; nothing about them changes hands. */
export async function inviteMatchedPerson(ctx: AgencyContext, roleId: string, recommendationId: string): Promise<MatchedPerson> {
  assertWriter(ctx)
  const list = await listMatchedPeople(ctx, roleId)
  const person = list.people.find((p) => p.recommendationId === recommendationId)
  if (!person) throw new AgencyAccessError("that person is not on this role's list")
  if (person.state === "applied") throw new AgencyAccessError("they have already applied")
  if (person.state === "invited") return person

  const pub = createAdminClient()
  const { error } = await pub
    .from("role_recommendations")
    .update({ state: "invited" })
    .eq("id", recommendationId)
    .in("state", ["new", "seen"])
  if (error) throw error

  await writeAudit(agencyAdmin(), {
    agencyId: ctx.agencyId,
    roleId,
    actorId: ctx.userId,
    entityType: "matching",
    entityRef: "recommendation",
    action: "invited",
    toValue: { recommendation_id: recommendationId },
  })
  return { ...person, state: "invited", invitedAt: new Date().toISOString() }
}
