/**
 * Probe questions, shared by the screening UI and the submission builder.
 *
 * The handoff's client document ends every candidate with a "Suggested
 * interview focus" line. In the prototype that was seeded `probeAreas`; in
 * the real product it is the questions the recruiter actually put on the
 * call script, which is why this lives in lib rather than in the page: the
 * server has to resolve the same ids when it freezes a submission snapshot.
 *
 * Ids double as `candidate_reviews.call_answers` keys, and the review API
 * caps those at 10 characters, so they stay short by design. A requirement
 * ref (R02) means a gap question generated from that requirement; an L id
 * means one of the standard probes below.
 */

export interface ProbeQuestion {
  id: string
  text: string
  why: string
  source: "gap" | "library"
}

export const PROBE_LIBRARY: Array<{ id: string; text: string; why: string }> = [
  { id: "L01", text: "How much hands-on delivery versus management are they looking for next?", why: "Seniority calibration" },
  { id: "L02", text: "What does the next step in their career actually look like to them?", why: "Motivation" },
  { id: "L03", text: "Why are they open to moving right now?", why: "Motivation" },
  { id: "L04", text: "What would have to be true for them to turn this down?", why: "Motivation" },
  { id: "L05", text: "Is the notice period negotiable, and does garden leave overlap?", why: "Logistics" },
  { id: "L06", text: "Where are they in any other processes?", why: "Logistics" },
  { id: "L07", text: "How firm is the salary expectation, and what sits behind the number?", why: "Logistics" },
  { id: "L08", text: "What does their week look like on site versus at home?", why: "Ways of working" },
  { id: "L09", text: "Walk me through the hardest problem they owned end to end.", why: "Depth" },
  { id: "L10", text: "What did they inherit versus what did they build?", why: "Depth" },
  { id: "L11", text: "How do they handle disagreement with a stakeholder who outranks them?", why: "Ways of working" },
  { id: "L12", text: "Which part of this role would stretch them most?", why: "Self awareness" },
]

const LIBRARY_BY_ID = new Map(PROBE_LIBRARY.map((q) => [q.id, q]))

/** The question a gap on this requirement asks. One phrasing, both sides. */
export function gapProbeText(requirementText: string): string {
  return `On ${requirementText.toLowerCase()}: what have they actually done here?`
}

/**
 * Resolve stored `call_answers` keys back into readable questions.
 * Unknown keys are dropped rather than rendered raw: a submission must never
 * show a client an id it cannot explain.
 */
export function resolveProbes(
  keys: string[],
  requirements: Array<{ ref: string; text: string }>
): Array<{ id: string; text: string }> {
  const reqByRef = new Map(requirements.map((r) => [r.ref, r]))
  const out: Array<{ id: string; text: string }> = []
  for (const key of keys) {
    const lib = LIBRARY_BY_ID.get(key)
    if (lib) {
      out.push({ id: key, text: lib.text })
      continue
    }
    const req = reqByRef.get(key)
    if (req) out.push({ id: key, text: gapProbeText(req.text) })
  }
  return out
}

/**
 * The client-facing form: short focus areas, not the recruiter's phrasing.
 * The document joins these with a middot exactly as the handoff does.
 */
export function probeAreasForClient(
  callAnswers: Record<string, string> | null | undefined,
  requirements: Array<{ ref: string; text: string }>
): string[] {
  if (!callAnswers) return []
  return resolveProbes(Object.keys(callAnswers), requirements).map((p) => p.text)
}
