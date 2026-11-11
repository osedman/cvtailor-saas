/**
 * Reading what a round's write-up SAYS — recruiter-side only.
 *
 * WHY THIS IS ITS OWN MODULE, and not four lines in rounds.ts.
 *
 * `lib/agency/rounds.ts` is a mixed module: hiring managers call `offerSlot`,
 * `withdrawSlot` and `decideRound` from it, so a build-failing scan in
 * `lib/__tests__/agency-transcription.test.ts` forbids ANY read of
 * `round_artifacts.content` anywhere in that file. The rule is right and it
 * fired the moment this feature was written. §5.7 and the consent copy both
 * promise the client is never handed the tape, and a file-level scan cannot
 * tell a recruiter-scoped query from a client-scoped one sitting ten lines
 * away — so it forbids the lot.
 *
 * The answer is to put the read where the rule's intent already points:
 * a module with no hiring-manager entry point at all. Every function here
 * takes an `AgencyContext` — never a `HiringContext` — and a scan asserts it,
 * so the protection follows the code instead of being stepped around.
 *
 * WHAT MAY BE READ. kind='debrief' ONLY, filtered in the query rather than
 * after it. The other kind is 'transcript', which exists solely where a
 * candidate consented to a recording; reading artifacts unfiltered would leak
 * that consent by inference even if the text were thrown away, because the
 * ROW's existence is the signal. There is no transcript writer yet
 * (`round_artifacts.kind` has none, and the DPIA is the reason) — this is the
 * guard for the day there is one.
 *
 * Added 18 September 2026, after Ose walked the interview loop and found the
 * recruiter's screen could say a write-up existed and not a syllable of what
 * it said.
 */

import { agencyAdmin } from "./db"
import type { AgencyContext } from "./types"

export interface RoundDebrief {
  /** The prose the client typed. May be empty: saved-with-nothing-in-it is a
   * real state, and distinguishing it from "not written up" is the caller's
   * job, not this module's. */
  notes: string
  answers: Array<{ key: string; question: string; answer: string }>
  /** Which hat wrote it, so a screen never attributes a recruiter's own note
   * to the client. There is no author beyond the hat — round_id is UNIQUE, so
   * there is exactly one write-up per round and no author column to read. */
  writtenBy: "hiring_manager" | "recruiter" | ""
  writtenAt: string
}

export interface DebriefRead {
  /** Rounds that have a write-up at all — the flag the loop sequences on
   * ("no artifact, no progression"), independent of whether it has text. */
  written: Set<string>
  /** round_id → what it says. Only present for rounds with a debrief. */
  body: Map<string, RoundDebrief>
}

/**
 * Write-ups for a set of rounds, recruiter-scoped.
 *
 * Both halves come from ONE query. They were two reads for a while — a flag
 * here, the text on the dossier — and that is exactly how a screen ends up
 * able to say "written up" while being unable to show it.
 */
export async function readDebriefs(
  ctx: AgencyContext,
  roundIds: string[]
): Promise<DebriefRead> {
  const empty: DebriefRead = { written: new Set(), body: new Map() }
  if (roundIds.length === 0) return empty

  const admin = agencyAdmin()
  const { data, error } = await admin
    .from("round_artifacts")
    .select("round_id, content, created_at")
    .eq("agency_id", ctx.agencyId)
    .eq("kind", "debrief")
    .in("round_id", roundIds)
  if (error) throw error

  const out: DebriefRead = { written: new Set(), body: new Map() }
  for (const row of data ?? []) {
    const roundId = row.round_id as string
    out.written.add(roundId)

    /*
     * `content` is jsonb written by writeDebrief as {answers, notes,
     * written_by}. A row predating a shape change, or written by something
     * else, must degrade to "no text" rather than throw on a screen whose job
     * is to show a decision — so every field is checked rather than trusted.
     */
    const c = (row.content ?? {}) as Record<string, unknown>
    const writtenBy =
      c.written_by === "hiring_manager" || c.written_by === "recruiter" ? c.written_by : ""
    const answers = Array.isArray(c.answers)
      ? (c.answers as Array<Record<string, unknown>>)
          .filter((a) => a && typeof a.key === "string")
          .map((a) => ({
            key: String(a.key ?? ""),
            question: typeof a.question === "string" ? a.question : "",
            answer: typeof a.answer === "string" ? a.answer : "",
          }))
      : []

    out.body.set(roundId, {
      notes: typeof c.notes === "string" ? c.notes : "",
      answers,
      writtenBy,
      writtenAt: (row.created_at as string) ?? "",
    })
  }
  return out
}
