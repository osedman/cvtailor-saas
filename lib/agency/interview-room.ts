/**
 * The interview room: one candidate, all of their rounds, for the client.
 *
 * Ose, walking staging on 16 September 2026: a pop-up per candidate, somewhere
 * a hiring manager can actually perform a round rather than writing it up in a
 * row inside a list of rows. Figma frame 13, band B.
 *
 * DISCLOSURE IS THE SUBMISSION, NOT THE ROLE. A hiring manager may open a room
 * only for a candidate who was actually SENT to them: the gate is
 * getClientShortlist, which resolves a submission snapshot for one of the
 * caller's own contact ids and is the same door the shortlist screen uses. A
 * round on a role they hold is not enough — the recruiter may be interviewing
 * somebody they never submitted, and that is the recruiter's business.
 *
 * Everything the room shows about the PERSON comes out of that snapshot,
 * frozen at generation. Not the live candidate row, and not the evidence map:
 * what the client sees is what the client was sent, and this cannot widen it
 * by accident.
 *
 * THE PLAN IS A NUMBER FROM THE ROLE. Both hiring-manager screens passed
 * `planned={2}` as a literal until 17 Sep while job_roles.planned_rounds was a
 * real field set at intake, so a three-round process was told it was on its
 * final round. "The last round" cannot mean anything until that is true.
 */

import { agencyAdmin } from "./db"
import { getClientShortlist } from "./client-shortlist"
import type { HiringContext, RoundStatus } from "./types"

export interface RoomRound {
  id: string
  roundNumber: number
  scheduledAt: string | null
  durationMinutes: number
  meetingUrl: string
  status: RoundStatus
  /** A write-up exists. One per round — round_artifacts.round_id is unique. */
  hasDebrief: boolean
  decision: string | null
  decidedAt: string | null
}

export interface InterviewRoom {
  role: { id: string; ref: string; title: string; plannedRounds: number }
  candidate: {
    ref: string
    fullName: string
    currentTitle: string | null
    /** As the client received it, frozen in the submission snapshot. */
    narrative: string
    strengths: string[]
    gaps: string[]
    mustHaveHit: number | null
    mustHaveTotal: number | null
  }
  rounds: RoomRound[]
  /**
   * The round this person is being asked about, if any: the earliest one that
   * has happened and is not yet decided. `null` when there is nothing owed —
   * which is a state the room renders rather than an error.
   */
  currentRoundId: string | null
  /** True when the current round is at or beyond the planned count. */
  atFinalRound: boolean
}

/** Snapshot entries are loose jsonb; read them defensively. */
function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean) : []
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

export async function getInterviewRoom(
  ctx: HiringContext,
  roleId: string,
  candidateRef: string
): Promise<InterviewRoom | null> {
  // The gate. No submission to this caller for this role means no room, and
  // that is true even if they hold the role and a round exists on it.
  const shortlist = await getClientShortlist(ctx, roleId)
  if (!shortlist) return null

  const admin = agencyAdmin()

  const { data: snapRow } = await admin
    .from("submissions")
    .select("snapshot")
    .eq("id", shortlist.submissionId)
    .maybeSingle()
  const snapshot = (snapRow?.snapshot ?? {}) as { shortlisted?: Array<Record<string, unknown>> }
  const entry = (snapshot.shortlisted ?? []).find((e) => str(e.ref) === candidateRef)
  // Sent the shortlist, but this person was not on it.
  if (!entry) return null

  const { data: role } = await admin
    .from("job_roles")
    .select("id, ref, title, planned_rounds")
    .eq("id", roleId)
    .maybeSingle()
  if (!role) return null

  // Rounds for this candidate, scoped to the caller's own contact ids — the
  // same restriction every other hiring-manager read carries.
  const contactIds = ctx.links.map((l) => l.contactId)
  const { data: candidate } = await admin
    .from("candidates")
    .select("id")
    .eq("role_id", roleId)
    .eq("ref", candidateRef)
    .maybeSingle()

  let rounds: RoomRound[] = []
  if (candidate) {
    const { data: rows } = await admin
      .from("interview_rounds")
      .select("id, round_number, scheduled_at, duration_minutes, meeting_url, status")
      .eq("role_id", roleId)
      .eq("candidate_id", candidate.id as string)
      .in("contact_id", contactIds)
      .order("round_number", { ascending: true })

    const ids = (rows ?? []).map((r) => r.id as string)
    const [{ data: artifacts }, { data: decisions }] = await Promise.all([
      ids.length
        ? admin.from("round_artifacts").select("round_id").eq("kind", "debrief").in("round_id", ids)
        : Promise.resolve({ data: [] as Array<{ round_id: string }> }),
      ids.length
        ? admin
            .from("round_decisions")
            .select("round_id, decision, created_at")
            .in("round_id", ids)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as Array<{ round_id: string; decision: string; created_at: string }> }),
    ])
    const debriefed = new Set((artifacts ?? []).map((a) => a.round_id as string))
    // Append-only, newest wins — the same rule round_decisions is read by
    // everywhere else.
    const latest = new Map<string, { decision: string; created_at: string }>()
    for (const d of decisions ?? []) {
      const rid = d.round_id as string
      if (!latest.has(rid)) latest.set(rid, { decision: d.decision as string, created_at: d.created_at as string })
    }

    rounds = (rows ?? []).map((r) => {
      const d = latest.get(r.id as string)
      return {
        id: r.id as string,
        roundNumber: r.round_number as number,
        scheduledAt: (r.scheduled_at as string | null) ?? null,
        durationMinutes: r.duration_minutes as number,
        meetingUrl: (r.meeting_url as string) ?? "",
        status: r.status as RoundStatus,
        hasDebrief: debriefed.has(r.id as string),
        decision: d?.decision ?? null,
        decidedAt: d?.created_at ?? null,
      }
    })
  }

  /* What is owed: the earliest round that has HAPPENED and carries no
   * decision. A scheduled round in the future is not owed — nothing can be
   * written about an interview that has not occurred — and a cancelled one is
   * history. */
  const owed = rounds.find((r) => r.status === "completed" && !r.decision) ?? null
  const plannedRounds = (role.planned_rounds as number | null) ?? 2

  return {
    role: {
      id: role.id as string,
      ref: role.ref as string,
      title: role.title as string,
      plannedRounds,
    },
    candidate: {
      ref: candidateRef,
      fullName: str(entry.full_name),
      currentTitle: str(entry.current_title) || null,
      narrative: str(entry.narrative),
      strengths: strList(entry.strengths),
      gaps: strList(entry.gaps),
      mustHaveHit: num(entry.must_have_hit),
      mustHaveTotal: num(entry.must_have_total),
    },
    rounds,
    currentRoundId: owed?.id ?? null,
    /* The plan stays a plan. This says "you are at or past the last planned
     * round", which changes what the room SAYS; it never refuses another. */
    atFinalRound: owed ? owed.roundNumber >= plannedRounds : false,
  }
}
