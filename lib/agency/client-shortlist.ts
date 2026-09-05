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
import { offerSlot } from "./rounds"
import type { HiringContext } from "./types"

export type ClientDecisionAction = "interview" | "decline"

export interface ShortlistEntry {
  ref: string
  fullName: string
  currentTitle: string | null
  location: string | null
  years: number | null
  redacted: boolean
  /** The action this contact already took on the candidate, if any. */
  action: string | null
}

export interface ClientShortlist {
  submissionId: string
  recipientId: string
  agencyId: string
  contactId: string
  generatedAt: string
  intro: string
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

  const snapshot = (s.snapshot ?? {}) as { intro?: string; shortlisted?: Array<Record<string, unknown>> }
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
    entries: (snapshot.shortlisted ?? []).map((e) => ({
      ref: String(e.ref ?? ""),
      fullName: String(e.full_name ?? ""),
      currentTitle: typeof e.current_title === "string" ? e.current_title : null,
      location: typeof e.location === "string" ? e.location : null,
      years: typeof e.years === "number" ? e.years : null,
      redacted: e.redacted === true,
      action: latest.get(String(e.ref ?? "")) ?? null,
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
    if (!entry || (d.action !== "interview" && d.action !== "decline")) {
      skipped.push(d.ref)
      continue
    }
    if (entry.action) {
      skipped.push(d.ref)
      continue
    }
    const { data: cand } = await admin
      .from("candidates")
      .select("id")
      .eq("agency_id", shortlist.agencyId)
      .eq("ref", d.ref)
      .maybeSingle()
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
  const offered: string[] = []
  for (let i = 0; i < Math.min(windows.length, 24); i++) {
    const w = windows[i]
    try {
      const { slotId } = await offerSlot(ctx, { contactId, startsAt: w.start, endsAt: w.end, roleId })
      offered.push(slotId)
    } catch (e) {
      return { offered, failed: { index: i, error: e instanceof Error ? e.message : "could not offer that window" } }
    }
  }
  return { offered, failed: null }
}
