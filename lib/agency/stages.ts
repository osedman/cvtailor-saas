/**
 * The recruiter-side stage for every candidate on a set of roles.
 *
 * Server-only. The round facts come from getRoleFactsBatch — the one
 * assembler the role header and the next-action ladder already read — so a
 * stage can never disagree with the header above it. What is added here is
 * per candidate: the recruiter's own call (to know who was shortlisted),
 * any placement, and who a handover pack was generated for.
 *
 * Scoped to the role throughout. A candidate row belongs to one role and its
 * rounds are read through that role's facts, so a person on two roles has
 * two stages.
 */

import { agencyAdmin } from "./db"
import type { AgencyContext } from "./types"
import { getRoleFactsBatch } from "./role-facts"
import { stageOf, suggestedHire, type Stage } from "./stage"

export interface RoleStages {
  /** Keyed by candidate id. Null means the loop never reached them. */
  byCandidate: Map<string, Stage | null>
  /** Exactly one taken forward, or null. */
  suggestedId: string | null
  /** Who a handover pack exists for — the recruiter's confirmed pick. */
  pickedId: string | null
}

export async function getStagesForRoles(
  ctx: AgencyContext,
  roleIds: string[],
  now: Date = new Date()
): Promise<Map<string, RoleStages>> {
  const out = new Map<string, RoleStages>()
  const ids = [...new Set(roleIds.filter(Boolean))]
  if (ids.length === 0) return out

  const admin = agencyAdmin()
  const [facts, candidates, placements, packs] = await Promise.all([
    getRoleFactsBatch(ctx, ids, now.toISOString()),
    admin.from("candidates").select("id, ref, role_id").eq("agency_id", ctx.agencyId).in("role_id", ids),
    admin.from("placements").select("role_id, candidate_id, status").eq("agency_id", ctx.agencyId).in("role_id", ids),
    admin
      .from("handover_packs")
      .select("role_id, candidate_id, generated_at")
      .eq("agency_id", ctx.agencyId)
      .in("role_id", ids)
      .order("generated_at", { ascending: true }),
  ])
  for (const r of [candidates, placements, packs]) if (r.error) throw r.error

  const candidateRows = candidates.data ?? []
  const candidateIds = candidateRows.map((c) => c.id as string)
  const { data: reviews, error: reviewErr } = candidateIds.length
    ? await admin.from("recruiter_reviews").select("candidate_id, decision").eq("agency_id", ctx.agencyId).in("candidate_id", candidateIds)
    : { data: [], error: null }
  if (reviewErr) throw reviewErr

  const shortlisted = new Set((reviews ?? []).filter((r) => r.decision === "shortlist").map((r) => r.candidate_id as string))
  const placementBy = new Map((placements.data ?? []).map((p) => [`${p.role_id}:${p.candidate_id}`, { status: p.status as string }]))
  const firstPack = new Map<string, string>()
  // The NEWEST pack is the current pick. Keeping the first one meant a
  // recruiter who changed the pick saw the old candidate "confirmed" again on
  // reload (21 Sep 2026). Rows arrive oldest first, so the last write wins.
  for (const p of packs.data ?? []) {
    if (p.candidate_id) firstPack.set(p.role_id as string, p.candidate_id as string)
  }

  for (const roleId of ids) {
    const f = facts.get(roleId)
    if (!f) continue
    const byCandidate = new Map<string, Stage | null>()
    for (const c of candidateRows.filter((c) => c.role_id === roleId)) {
      const id = c.id as string
      byCandidate.set(
        id,
        stageOf(
          {
            shortlisted: shortlisted.has(id),
            rounds: f.rounds.filter((r) => r.candidateRef === c.ref),
            plannedRounds: f.plannedRounds,
            decisionsCompleteAt: f.decisionsCompleteAt,
            placement: placementBy.get(`${roleId}:${id}`) ?? null,
          },
          now
        )
      )
    }
    out.set(roleId, {
      byCandidate,
      suggestedId: suggestedHire([...byCandidate].map(([id, stage]) => ({ id, stage }))),
      pickedId: firstPack.get(roleId) ?? null,
    })
  }
  return out
}
