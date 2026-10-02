/**
 * The call record — what was asked on a screening call (frame 37, approved
 * 2 Oct 2026). Pure: no database, no server imports, so the screen and the
 * review route share one definition.
 *
 * candidate_reviews.call_answers is the call script as it stands now
 * ({ questionKey: answer }). It forgets: removing a question deletes its
 * answer. The trail is the memory — append-only events the review route
 * writes by diffing the script before and after each save. Recruiter-only:
 * no client surface reads it (Ose, 2 Oct).
 */

export type TrailKind = "added" | "answered" | "edited" | "removed"

export interface TrailEvent {
  /** ISO time the save happened. */
  at: string
  /** auth user id of the recruiter who saved. */
  by: string
  kind: TrailKind
  /** The call_answers key: R02 (gap), L03 (standard), Qxxxxxxxx (written). */
  key: string
  /** The question as it read when the event happened, so a later edit or
   *  removal of the question never rewrites what was asked. */
  text: string
  /** removed: the answer that went with it, kept here. answered / edited: the answer. */
  answer?: string
}

/** The most events one call keeps. A call is not a chat log. */
export const TRAIL_CAP = 500
const ANSWER_CAP = 4000

/**
 * The events a save produces. `textFor` resolves a key to its question;
 * an unresolvable key is recorded by its key alone rather than dropped —
 * the record must not have holes.
 */
export function trailEvents(
  before: Record<string, string>,
  after: Record<string, string>,
  textFor: (key: string) => string | null,
  by: string,
  at: string
): TrailEvent[] {
  const out: TrailEvent[] = []
  const text = (k: string) => textFor(k) ?? k
  for (const [key, answer] of Object.entries(after)) {
    const prev = before[key]
    const now = (answer ?? "").trim()
    if (prev === undefined) {
      out.push({ at, by, kind: "added", key, text: text(key) })
      if (now) out.push({ at, by, kind: "answered", key, text: text(key), answer: now.slice(0, ANSWER_CAP) })
      continue
    }
    const was = (prev ?? "").trim()
    if (now === was) continue
    if (!was && now) out.push({ at, by, kind: "answered", key, text: text(key), answer: now.slice(0, ANSWER_CAP) })
    else if (now) out.push({ at, by, kind: "edited", key, text: text(key), answer: now.slice(0, ANSWER_CAP) })
  }
  for (const [key, prev] of Object.entries(before)) {
    if (key in after) continue
    const was = (prev ?? "").trim()
    out.push({ at, by, kind: "removed", key, text: text(key), ...(was ? { answer: was.slice(0, ANSWER_CAP) } : {}) })
  }
  return out
}

/** Append, keeping the newest TRAIL_CAP. A malformed stored value starts fresh. */
export function appendTrail(existing: unknown, events: TrailEvent[]): TrailEvent[] {
  const prior = Array.isArray(existing) ? (existing as TrailEvent[]) : []
  const all = prior.concat(events)
  return all.length > TRAIL_CAP ? all.slice(all.length - TRAIL_CAP) : all
}

/** A question the recruiter wrote. candidateId null: every candidate on the role. */
export interface WrittenQuestion {
  id: string
  key: string
  text: string
  candidateId: string | null
  removedAt: string | null
}

/** A written question's key: 'Q' + 8 hex, inside call_answers' 10-character cap. */
export const WRITTEN_KEY = /^Q[0-9a-f]{8}$/

/** One line of the record, in words. */
export function trailLine(e: TrailEvent): string {
  switch (e.kind) {
    case "added":
      return `Put on the call: “${e.text}”`
    case "answered":
      return `Answered “${e.text}”`
    case "edited":
      return `Changed the answer to “${e.text}”`
    case "removed":
      return e.answer ? `Removed “${e.text}” — its answer is kept below` : `Removed “${e.text}” — unanswered`
  }
}
