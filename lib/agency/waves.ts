/**
 * Invitation waves.
 *
 * The problem, in Ose's words: twenty candidates racing for eight slots, and
 * Tailr inviting someone it cannot actually seat. A wave is the answer — a
 * few go out, the rest wait, and the next goes when the first has had its
 * time or when capacity opens.
 *
 * WAVE ONE IS NOT A SPECIAL CASE. The first invitation is simply the first
 * release: the reserve is everyone the client chose, nobody has been invited
 * yet, and the planner sizes it like any other. One code path, so the rule
 * that caps a release can never apply to later waves but not the first.
 *
 * NO RANKING. The product does not order people by score, so a wave does not
 * either — the reserve keeps the order the client decided in, which is their
 * own sequence rather than a judgement Tailr invented. Bands, never a rank,
 * here as everywhere else.
 *
 * HOLD IS NOT THE RESERVE. Somebody the client marked *hold* stays held: it
 * is a deliberate "not now", and releasing it automatically would override
 * the judgement they just recorded. The reserve is the people they said they
 * want to interview who have not gone out yet. Moving somebody off hold is
 * the client's act, on their own screen.
 */

import { agencyAdmin, writeAudit } from "./db"
import { inviteCohort, type CohortInviteResult } from "./cohort"
import { getInterviewSettings } from "./interview-settings"

/** Why a release was the size it was — shown, not inferred. */
export type ReleaseReason =
  | "nothing_in_reserve"
  | "no_capacity"
  | "wave_full"
  | "capacity_capped"
  | "all_released"
  | "wave_still_running"

export interface ReleasePlan {
  /** How many to invite now. Zero is a normal answer. */
  release: number
  reason: ReleaseReason
  /** Left in reserve after this release. */
  remaining: number
}

export interface ReleaseInputs {
  /** People chosen to interview who have not been invited yet. */
  reserveSize: number
  /** Already invited and still to book — they are holding capacity. */
  awaiting: number
  /** Windows nobody holds. */
  openWindows: number
  /** How many go out at once. Null invites everyone capacity allows. */
  waveSize: number | null
  /** True while the previous wave still has time to answer. */
  waveStillRunning: boolean
}

/**
 * How many to invite now.
 *
 * Capacity is the binding constraint, never the wave size: inviting five
 * into three windows recreates the race the wave exists to prevent. The
 * reason says which limit bit, so the board can explain itself rather than
 * silently inviting fewer than someone expected.
 */
export function planRelease(input: ReleaseInputs): ReleasePlan {
  const { reserveSize, awaiting, openWindows, waveSize, waveStillRunning } = input
  if (reserveSize <= 0) return { release: 0, reason: "nothing_in_reserve", remaining: 0 }

  // Everyone already invited and still choosing is holding a window in all
  // but name, so the free capacity is what is left after them.
  const capacity = Math.max(0, openWindows - awaiting)
  if (capacity === 0) return { release: 0, reason: "no_capacity", remaining: reserveSize }

  // A wave that has not had its time keeps the rest waiting — unless there
  // is room, which is the "or when capacity opens" half of the rule.
  if (waveStillRunning && awaiting > 0) {
    return { release: 0, reason: "wave_still_running", remaining: reserveSize }
  }

  const wanted = waveSize === null ? reserveSize : Math.min(waveSize, reserveSize)
  const release = Math.min(wanted, capacity)
  const remaining = reserveSize - release
  const reason: ReleaseReason =
    release < wanted ? "capacity_capped" : remaining > 0 ? "wave_full" : "all_released"
  return { release, reason, remaining }
}

export const RELEASE_SENTENCE: Record<ReleaseReason, string> = {
  nothing_in_reserve: "Everyone chosen has been invited.",
  no_capacity: "No free windows, so nobody new can be invited yet.",
  wave_still_running: "The last wave is still choosing. The next goes when they have had their time, or when a window frees up.",
  wave_full: "The wave is full. The rest go out next.",
  capacity_capped: "Fewer went out than the wave allows, because there were only so many free windows.",
  all_released: "Everyone chosen has now been invited.",
}

export interface WaveState {
  /** Refs chosen to interview and not yet invited, in the client's own order. */
  reserve: string[]
  awaiting: number
  openWindows: number
  waveSize: number | null
  /** When the reserve is next due out, if a wave is still running. */
  nextReleaseAt: string | null
}

/** Everything the planner needs, read once. */
export async function getWaveState(agencyId: string, roleId: string): Promise<WaveState> {
  const admin = agencyAdmin()
  const { settings } = await getInterviewSettings(agencyId, roleId)

  const [{ data: rounds }, { data: slots }, { data: taken }] = await Promise.all([
    admin
      .from("interview_rounds")
      .select("candidate_id, slot_id, status, created_at")
      .eq("agency_id", agencyId)
      .eq("role_id", roleId),
    admin
      .from("availability_slots")
      .select("id, role_id")
      .eq("agency_id", agencyId)
      .is("revoked_at", null)
      .gt("ends_at", new Date().toISOString()),
    admin
      .from("interview_rounds")
      .select("slot_id")
      .eq("agency_id", agencyId)
      .neq("status", "cancelled")
      .not("slot_id", "is", null),
  ])

  const live = (rounds ?? []).filter((r) => r.status !== "cancelled")
  const invitedIds = new Set(live.map((r) => r.candidate_id as string))
  const awaiting = live.filter((r) => !r.slot_id).length
  const heldSlots = new Set((taken ?? []).map((r) => r.slot_id as string))
  const openWindows = (slots ?? []).filter((s) => (!s.role_id || s.role_id === roleId) && !heldSlots.has(s.id as string)).length

  // The reserve: chosen to interview, no live round. In the order the client
  // decided, which is theirs rather than a ranking of ours.
  const { data: chosen } = await admin
    .from("client_actions")
    .select("candidate_ref, candidate_id, created_at")
    .eq("agency_id", agencyId)
    .eq("action", "interview")
    .order("created_at", { ascending: true })

  const seen = new Set<string>()
  const reserve: string[] = []
  for (const a of chosen ?? []) {
    const ref = (a.candidate_ref as string) ?? ""
    const id = (a.candidate_id as string) ?? ""
    if (!ref || seen.has(ref)) continue
    seen.add(ref)
    if (id && invitedIds.has(id)) continue
    reserve.push(ref)
  }

  // The last wave's clock runs from when it went out.
  const lastInvite = live.map((r) => (r.created_at as string) ?? "").sort().at(-1) ?? null
  const nextReleaseAt = lastInvite
    ? new Date(Date.parse(lastInvite) + settings.waveReleaseHours * 3_600_000).toISOString()
    : null

  return { reserve, awaiting, openWindows, waveSize: settings.waveSize, nextReleaseAt }
}

export interface ReleaseOutcome extends ReleasePlan {
  invited: CohortInviteResult["invited"]
  sentence: string
}

/**
 * Release the next wave. Safe to call often: when nothing should go out it
 * does nothing and says why, which is what lets the cron, the capacity
 * change and a person's button all share one path.
 */
export async function releaseWave(
  agencyId: string,
  roleId: string,
  contactId: string,
  actorId: string | null,
  now: Date = new Date()
): Promise<ReleaseOutcome> {
  const state = await getWaveState(agencyId, roleId)
  const waveStillRunning = state.nextReleaseAt !== null && Date.parse(state.nextReleaseAt) > now.getTime()
  const plan = planRelease({
    reserveSize: state.reserve.length,
    awaiting: state.awaiting,
    openWindows: state.openWindows,
    waveSize: state.waveSize,
    waveStillRunning,
  })

  if (plan.release === 0) {
    return { ...plan, invited: [], sentence: RELEASE_SENTENCE[plan.reason] }
  }

  const going = state.reserve.slice(0, plan.release)
  const result = await inviteCohort(agencyId, roleId, contactId, going, actorId)

  await writeAudit(agencyAdmin(), {
    agencyId,
    roleId,
    actorId,
    entityType: "round",
    entityRef: "wave",
    action: "wave_released",
    reason: plan.reason,
    toValue: { invited: result.invited.length, remaining: plan.remaining, wave_size: state.waveSize },
  })

  return { ...plan, invited: result.invited, sentence: RELEASE_SENTENCE[plan.reason] }
}


/**
 * Every role that might have a wave due, swept once.
 *
 * Deliberately dumb: it asks `releaseWave` about each live role and lets the
 * planner decide. A role with nothing in reserve, no capacity or a wave
 * still running costs two reads and returns zero, which is cheaper than
 * keeping a schedule in sync with reality.
 */
export async function releaseDueWaves(now: Date = new Date()): Promise<number> {
  const admin = agencyAdmin()
  const { data: roles, error } = await admin
    .from("job_roles")
    .select("id, agency_id, contact_id")
    .neq("status", "closed")
    .limit(300)
  if (error) throw error

  let released = 0
  for (const role of roles ?? []) {
    const contactId = role.contact_id as string | null
    // Without a contact there is nobody to attribute the round to; the
    // client-written-brief path sets this, and so does intake.
    if (!contactId) continue
    try {
      const outcome = await releaseWave(role.agency_id as string, role.id as string, contactId, null, now)
      released += outcome.invited.length
    } catch {
      // One role's failure must not stop the sweep.
    }
  }
  return released
}
