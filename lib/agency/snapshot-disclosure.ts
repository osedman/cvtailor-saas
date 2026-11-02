/**
 * What a submission snapshot may show its reader — ONE rule, for every door.
 *
 * WHY THIS EXISTS (29 Sep 2026). The disclosure switches the recruiter froze
 * into a submission (scores, evidence, probes, notes, logistics, CV) were
 * applied in exactly one place: getClientShortlist, which feeds the hiring
 * manager's workspace. The token portal (/api/portal/[token]) returned the
 * RAW snapshot — so a candidate who asked to be sent without their name had
 * it shown there, and scores, evidence, the recruiter's screening narrative,
 * availability and salary reached the browser whatever the switches said.
 * The page not rendering a field does not help: the response is the leak.
 *
 * Two doors, one rule. Both read the switches with readDisclosure and map
 * each candidate with discloseEntry, so the next field added to a snapshot is
 * withheld by default everywhere rather than leaking through whichever door
 * forgot. Pure and server-import-free, so tests exercise it directly.
 *
 * NULL MEANS WITHHELD, NOT UNKNOWN. A withheld score is null, never 0; a
 * withheld list is null, never []. The UI says "not shared" for null and
 * "none" for an empty list — the difference is a fact about the recruiter.
 */

export interface SnapshotDisclosure {
  scores: boolean
  evidence: boolean
  probes: boolean
  notes: boolean
  logistics: boolean
  /** The CV, through the CV route only. See lib/agency/cv-disclosure.ts. */
  cv: boolean
}

/**
 * The switches as frozen at generation, read back verbatim.
 *
 * An older snapshot with no disclosure block predates the switches; the
 * builder's own defaults then are the honest reading (scores, evidence,
 * probes, logistics on; notes off). The CV is the exception and defaults the
 * OTHER way: a snapshot with no `cv` key was sent under the rule that the CV
 * would not reach the client, so missing means NO.
 */
export function readDisclosure(snapshot: unknown): SnapshotDisclosure {
  const d = ((snapshot as { disclosure?: Record<string, unknown> } | null)?.disclosure ?? {}) as Record<string, unknown>
  return {
    scores: d.scores !== false,
    evidence: d.evidence !== false,
    probes: d.probes !== false,
    notes: d.notes === true,
    logistics: d.logistics !== false,
    cv: d.cv === true,
  }
}

export interface DisclosedEntry {
  ref: string
  /** "" when the candidate asked to be sent without their name. Never shipped. */
  fullName: string
  redacted: boolean
  currentTitle: string | null
  location: string | null
  years: number | null
  /** The recruiter screened them by phone. A fact about the process, not the person. */
  reviewed: boolean
  overall: number | null
  /** The score before the recruiter's screening adjusted it; with `scores` only. */
  originalOverall: number | null
  mustHaveHit: number | null
  mustHaveTotal: number | null
  narrative: string | null
  strengths: Array<{ requirement: string; quote: string }> | null
  gaps: Array<{ requirement: string; weight: string }> | null
  probeAreas: string[] | null
  /** Availability and salary confirmation; with `logistics` only. */
  availability: string | null
  salaryConfirm: string | null
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

/** One candidate from a snapshot, with everything the switches did not allow removed. */
export function discloseEntry(e: Record<string, unknown>, d: SnapshotDisclosure): DisclosedEntry {
  const redacted = e.redacted === true
  return {
    ref: String(e.ref ?? ""),
    // An erased or name-withheld candidate's name never leaves the server —
    // hiding it in the UI still shipped it to the browser (22 Sep 2026).
    fullName: redacted ? "" : String(e.full_name ?? ""),
    redacted,
    currentTitle: str(e.current_title),
    location: str(e.location),
    years: num(e.years),
    reviewed: e.reviewed === true,
    overall: d.scores ? num(e.overall) : null,
    originalOverall: d.scores ? num(e.original_overall) : null,
    mustHaveHit: d.scores ? num(e.must_have_hit) : null,
    mustHaveTotal: d.scores ? num(e.must_have_total) : null,
    narrative: d.notes ? str(e.narrative) : null,
    strengths: d.evidence
      ? ((Array.isArray(e.strengths) ? e.strengths : []) as Array<Record<string, unknown>>)
          .map((x) => ({ requirement: String(x.requirement ?? ""), quote: String(x.quote ?? "") }))
          .filter((x) => x.requirement && x.quote)
          .slice(0, 24)
      : null,
    gaps: d.evidence
      ? ((Array.isArray(e.gaps) ? e.gaps : []) as Array<Record<string, unknown>>)
          .map((x) => ({ requirement: String(x.requirement ?? ""), weight: String(x.weight ?? "") }))
          .filter((x) => x.requirement)
          .slice(0, 3)
      : null,
    probeAreas: d.probes
      ? ((Array.isArray(e.probe_areas) ? e.probe_areas : []) as unknown[]).map((x) => String(x)).filter(Boolean).slice(0, 3)
      : null,
    availability: d.logistics ? str(e.availability) : null,
    salaryConfirm: d.logistics ? str(e.salary_confirm) : null,
  }
}

export interface DisclosedPortalSnapshot {
  role: { ref: string; title: string; company: string; location: string }
  generatedAt: string | null
  intro: string
  disclosure: SnapshotDisclosure
  shortlisted: DisclosedEntry[]
}

/**
 * The portal's whole payload, built from the snapshot by allow-list: only the
 * fields named here leave the server. Recruiter-internal snapshot fields
 * (category sub-scores, confidence, anything added later) never do.
 */
export function disclosePortalSnapshot(snapshot: unknown): DisclosedPortalSnapshot | null {
  if (!snapshot || typeof snapshot !== "object") return null
  const s = snapshot as Record<string, unknown>
  const role = (s.role ?? {}) as Record<string, unknown>
  const d = readDisclosure(s)
  return {
    role: {
      ref: String(role.ref ?? ""),
      title: String(role.title ?? ""),
      company: String(role.company ?? ""),
      location: String(role.location ?? ""),
    },
    generatedAt: typeof s.generated_at === "string" ? s.generated_at : null,
    intro: typeof s.intro === "string" ? s.intro : "",
    disclosure: d,
    shortlisted: (Array.isArray(s.shortlisted) ? s.shortlisted : []).map((e) => discloseEntry(e as Record<string, unknown>, d)),
  }
}
