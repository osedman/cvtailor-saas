/**
 * The client's shortlist, in their workspace — and what they do with it.
 *
 * Until now the submission lived only behind the portal token: the client
 * decided one candidate at a time in a doorway, then nothing carried them
 * into offering interview times. Submission is where the interview
 * workflow starts, so the workspace needs the same three things the portal
 * has, as one task: the frozen snapshot, a way to say who to interview,
 * and a way to offer times sized to that choice.
 *
 * DISCLOSURE. Nothing here widens what the client sees. A submission
 * snapshot is the recruiter's deliberate disclosure to a named contact
 * (submission_recipients.contact_id), with the disclosure switches frozen
 * into it at generation. The workspace reads that snapshot only for a
 * submission whose recipient is one of the caller's own contact ids — the
 * token was the doorway to it, not the permission. Decisions are written
 * against that recipient row, exactly as the portal writes them, so the
 * recruiter's dashboard and the ladder see one kind of signal, not two.
 *
 * NO REMOVAL. "Not for this role" is a signal, never a removal. Nothing
 * here hides a candidate from the recruiter.
 */

import { agencyAdmin, writeAudit } from "./db"
import { getInterviewSettings } from "./interview-settings"
import { offerSlot } from "./rounds"
import type { HiringContext } from "./types"

/**
 * The client's call on one shortlisted candidate.
 *
 * `hold` means "not this wave, but do not write them off" — the signal a
 * client who is unsure would otherwise have to express as a decline, which
 * is the wrong thing entirely. It is also what invitation waves run on: the
 * held are the reserve. Like every other action here it is a signal on a
 * submission, never a removal, and the candidate is not told.
 */
export type ClientDecisionAction = "interview" | "hold" | "decline"

export const CLIENT_DECISIONS: ClientDecisionAction[] = ["interview", "hold", "decline"]

export interface ShortlistEntry {
  ref: string
  fullName: string
  currentTitle: string | null
  location: string | null
  years: number | null
  redacted: boolean
  /** The action this contact already took on the candidate, if any. */
  action: string | null
  /**
   * EVERYTHING BELOW IS ALREADY IN THE SNAPSHOT (20 Sep 2026).
   *
   * The workspace screen said "everyone your recruiter has put in front of
   * you, with the evidence behind each", and then rendered a name, a title
   * and one sentence — the same sentence under every candidate. The evidence
   * was not missing from the record; this mapper simply dropped it on the
   * floor while the portal rendered it from the same snapshot.
   *
   * Nothing here widens disclosure. Each field is gated by the switch the
   * recruiter froze at generation, and null means "not disclosed" rather than
   * "not known" — a distinction the UI has to keep, because saying "no note"
   * about a note that exists but was withheld would be a lie about the
   * recruiter.
   */
  overall: number | null
  mustHaveHit: number | null
  mustHaveTotal: number | null
  /** The recruiter's screening narrative, written for this client. */
  narrative: string | null
  /** Requirement + verbatim CV quote, strongest first. */
  strengths: Array<{ requirement: string; quote: string }> | null
  /** Must-haves with nothing under them. Known gaps, stated plainly. */
  gaps: Array<{ requirement: string; weight: string }> | null
  /** What the recruiter suggests this client probes at interview. */
  probeAreas: string[] | null
}

/**
 * Which switches the recruiter had on when they pressed send.
 *
 * Frozen into the snapshot at generation and read back verbatim — applying
 * today's switches to yesterday's submission is exactly what an immutable
 * snapshot exists to prevent. `notes` defaults to OFF; the other four
 * default on.
 */
export interface ShortlistDisclosure {
  scores: boolean
  evidence: boolean
  probes: boolean
  notes: boolean
  logistics: boolean
}

export interface ClientShortlist {
  submissionId: string
  recipientId: string
  agencyId: string
  contactId: string
  generatedAt: string
  intro: string
  disclosure: ShortlistDisclosure
  entries: ShortlistEntry[]
}

interface RecipientRow {
  id: string
  agency_id: string
  contact_id: string
  submission_id: string
  revoked_at: string | null
  submissions: { id: string; role_id: string; generated_at: string; snapshot: unknown } | Array<{ id: string; role_id: string; generated_at: string; snapshot: unknown }>
}

/** The latest submission on this role addressed to one of the caller's contacts, or null. */
export async function getClientShortlist(ctx: HiringContext, roleId: string): Promise<ClientShortlist | null> {
  const contactIds = ctx.links.map((l) => l.contactId)
  if (contactIds.length === 0) return null
  const admin = agencyAdmin()
  const { data, error } = await admin
    .from("submission_recipients")
    .select("id, agency_id, contact_id, submission_id, revoked_at, submissions!inner(id, role_id, generated_at, snapshot)")
    .eq("submissions.role_id", roleId)
    .in("contact_id", contactIds)
    .is("revoked_at", null)
  if (error) throw error
  const rows = (data ?? []) as unknown as RecipientRow[]
  if (rows.length === 0) return null
  const flat = rows.map((r) => ({ r, s: Array.isArray(r.submissions) ? r.submissions[0] : r.submissions })).filter((x) => x.s)
  flat.sort((a, b) => b.s.generated_at.localeCompare(a.s.generated_at))
  const { r, s } = flat[0]
  const link = ctx.links.find((l) => l.contactId === r.contact_id && l.agencyId === r.agency_id)
  if (!link) return null

  const snapshot = (s.snapshot ?? {}) as {
    intro?: string
    disclosure?: Partial<ShortlistDisclosure>
    shortlisted?: Array<Record<string, unknown>>
  }
  // Read back exactly as frozen. An older snapshot with no disclosure block
  // predates the switches, and the submission builder's own defaults are the
  // honest reading of what the recruiter intended then.
  const d = snapshot.disclosure ?? {}
  const disclosure: ShortlistDisclosure = {
    scores: d.scores !== false,
    evidence: d.evidence !== false,
    probes: d.probes !== false,
    notes: d.notes === true,
    logistics: d.logistics !== false,
  }
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
  const { data: actions } = await admin
    .from("client_actions")
    .select("candidate_ref, action, created_at")
    .eq("agency_id", r.agency_id)
    .eq("recipient_id", r.id)
    .order("created_at", { ascending: false })
  const latest = new Map<string, string>()
  for (const a of actions ?? []) {
    const ref = (a.candidate_ref as string) ?? ""
    if (ref && !latest.has(ref)) latest.set(ref, a.action as string)
  }

  return {
    submissionId: s.id,
    recipientId: r.id,
    agencyId: r.agency_id,
    contactId: r.contact_id,
    generatedAt: s.generated_at,
    intro: typeof snapshot.intro === "string" ? snapshot.intro : "",
    disclosure,
    entries: (snapshot.shortlisted ?? []).map((e) => ({
      ref: String(e.ref ?? ""),
      // An erased candidate's name never leaves the server — hiding it in the
      // UI still shipped it to the browser (22 Sep 2026).
      fullName: e.redacted === true ? "" : String(e.full_name ?? ""),
      currentTitle: typeof e.current_title === "string" ? e.current_title : null,
      location: typeof e.location === "string" ? e.location : null,
      years: typeof e.years === "number" ? e.years : null,
      redacted: e.redacted === true,
      action: latest.get(String(e.ref ?? "")) ?? null,
      overall: disclosure.scores ? num(e.overall) : null,
      mustHaveHit: disclosure.scores ? num(e.must_have_hit) : null,
      mustHaveTotal: disclosure.scores ? num(e.must_have_total) : null,
      narrative: disclosure.notes ? str(e.narrative) : null,
      strengths: disclosure.evidence
        ? ((e.strengths ?? []) as Array<Record<string, unknown>>)
            .map((x) => ({ requirement: String(x.requirement ?? ""), quote: String(x.quote ?? "") }))
            .filter((x) => x.requirement && x.quote)
            .slice(0, 3)
        : null,
      gaps: disclosure.evidence
        ? ((e.gaps ?? []) as Array<Record<string, unknown>>)
            .map((x) => ({ requirement: String(x.requirement ?? ""), weight: String(x.weight ?? "") }))
            .filter((x) => x.requirement)
            .slice(0, 3)
        : null,
      probeAreas: disclosure.probes
        ? ((e.probe_areas ?? []) as unknown[]).map((x) => String(x)).filter(Boolean).slice(0, 3)
        : null,
    })),
  }
}

/**
 * Record the client's decisions on the shortlist, as the portal does: one
 * client_actions row per candidate against the recipient row, audit
 * coupled. A candidate already acted on is left alone — the portal is
 * one-shot per candidate and the workspace keeps that, so a decision is
 * never silently overwritten. Returns the refs actually written.
 */
export async function recordClientDecisions(
  ctx: HiringContext,
  roleId: string,
  decisions: Array<{ ref: string; action: ClientDecisionAction }>
): Promise<{ written: string[]; skipped: string[] }> {
  const shortlist = await getClientShortlist(ctx, roleId)
  if (!shortlist) throw new Error("no shortlist on this role for you")
  const admin = agencyAdmin()
  const byRef = new Map(shortlist.entries.map((e) => [e.ref, e]))
  const written: string[] = []
  const skipped: string[] = []
  for (const d of decisions) {
    const entry = byRef.get(d.ref)
    if (!entry || !CLIENT_DECISIONS.includes(d.action)) {
      skipped.push(d.ref)
      continue
    }
    if (entry.action) {
      skipped.push(d.ref)
      continue
    }
    // Scoped to THIS role: refs restart at CAN-01 on every role, so an
    // agency-wide lookup matched two rows once a second role existed,
    // maybeSingle() errored, the error was ignored and candidate_id was
    // written NULL — which let the wave re-invite declined candidates
    // (21 Sep 2026). A failed lookup now throws rather than writing a null.
    const { data: cand, error: candError } = await admin
      .from("candidates")
      .select("id")
      .eq("agency_id", shortlist.agencyId)
      .eq("role_id", roleId)
      .eq("ref", d.ref)
      .maybeSingle()
    if (candError) throw candError
    const { error } = await admin.from("client_actions").insert({
      agency_id: shortlist.agencyId,
      recipient_id: shortlist.recipientId,
      candidate_id: (cand?.id as string | undefined) ?? null,
      candidate_ref: d.ref,
      action: d.action,
      message: "",
    })
    if (error) throw error
    await writeAudit(admin, {
      agencyId: shortlist.agencyId,
      roleId,
      actorId: ctx.userId,
      entityType: "submission",
      entityRef: d.ref,
      action: `client_${d.action}`,
      toValue: { via: "workspace", recipient_id: shortlist.recipientId },
    })
    written.push(d.ref)
  }
  return { written, skipped }
}

/**
 * Offer several windows for one role at once. Each goes through offerSlot,
 * so every validation and audit row the single path has, the batch has.
 * Stops at the first failure and reports how far it got.
 */
export async function offerWindows(
  ctx: HiringContext,
  roleId: string,
  windows: Array<{ start: string; end: string }>
): Promise<{ offered: string[]; failed: { index: number; error: string } | null }> {
  const shortlist = await getClientShortlist(ctx, roleId)
  const contactId = shortlist?.contactId ?? ctx.links[0]?.contactId
  if (!contactId) throw new Error("no contact to offer as")
  /**
   * A window inside the candidate's notice period is unbookable the moment
   * it is created.
   *
   * 20 Sep 2026: tomorrow-morning windows were offered under a 24-hour
   * notice rule, and the candidate's booking page showed nothing at all.
   * Both ends were behaving correctly — `listOpenWindows` filters on
   * `starts_at > now + minNotice`, which is the same setting — but the offer
   * did not know about it, so it wrote rows nobody could ever see and no
   * screen explained the silence.
   *
   * Refused here rather than in `offerSlot`: the primitive is shared with
   * the recruiter, who may legitimately seat somebody at short notice. This
   * is the client's batch path, and it is the one that produced the ghost
   * windows.
   *
   * The error names the setting and the fix, because the honest answer is
   * usually "your notice period is longer than the times you picked" rather
   * than anything being broken.
   */
  const { settings } = await getInterviewSettings(shortlist?.agencyId ?? ctx.links[0]?.agencyId ?? "", roleId)
  const earliest = Date.now() + settings.minNoticeHours * 3_600_000
  const tooSoon = windows.filter((w) => Date.parse(w.start) < earliest)
  if (tooSoon.length > 0 && tooSoon.length === windows.length) {
    return {
      offered: [],
      failed: {
        index: 0,
        error: `Every window you picked is inside the ${settings.minNoticeHours}-hour notice your candidates get, so none of them could be booked. Pick later times, or lower the notice period above.`,
      },
    }
  }

  const offered: string[] = []
  const bookable = windows.filter((w) => Date.parse(w.start) >= earliest)
  for (let i = 0; i < Math.min(bookable.length, 24); i++) {
    const w = bookable[i]
    try {
      const { slotId } = await offerSlot(ctx, { contactId, startsAt: w.start, endsAt: w.end, roleId })
      offered.push(slotId)
    } catch (e) {
      return { offered, failed: { index: i, error: e instanceof Error ? e.message : "could not offer that window" } }
    }
  }
  return { offered, failed: null }
}
