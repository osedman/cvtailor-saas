/**
 * The facts one role carries, assembled for the next-action ladder.
 *
 * Server-side and service-role, because the facts span tables the browser
 * never reads directly (rounds, decisions, packs, slots). Nothing here
 * interprets: every field is a count, a timestamp or an enum straight from a
 * row, and lib/agency/next-action.ts does the reading. That split is the
 * point — the dashboard, the header and (in Wave 3) the queue all consume
 * the same facts and the same ladder, so no screen can disagree with another
 * about where a role stands.
 *
 * Reuses the reads that already exist (listRoundsForRole, listOpenSlots, the
 * dashboard's candidate/review/decision shape) rather than a second copy of
 * any of them. The one thing added is a public.profiles lookup for the
 * owner's name, the same way the team route resolves it.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { agencyAdmin } from "./db"
import type { AgencyContext } from "./types"
import { derivePhase } from "./phases"
import { listOpenSlots, listRoundsForRole } from "./rounds"
import type { RoleFacts, RoundFacts } from "./next-action"

export interface RoleHeaderFacts extends RoleFacts {
  roleId: string
  ref: string
  title: string
  company: string
  ownerId: string | null
}

/** Shape of one entry in a submission snapshot; only the ref is read here. */
interface SnapshotEntry {
  ref?: string
}

export async function getRoleFacts(
  ctx: AgencyContext,
  roleId: string,
  now: string = new Date().toISOString()
): Promise<RoleHeaderFacts | null> {
  const admin = agencyAdmin()

  const { data: role, error: roleErr } = await admin
    .from("job_roles")
    .select("id, ref, title, company, status, closed_at, created_at, owner_id, planned_rounds")
    .eq("agency_id", ctx.agencyId)
    .eq("id", roleId)
    .maybeSingle()
  if (roleErr) throw roleErr
  if (!role) return null

  const [requirements, candidates, submission, packs, brief, rounds, openSlots] = await Promise.all([
    admin.from("requirements").select("id").eq("agency_id", ctx.agencyId).eq("role_id", roleId),
    admin.from("candidates").select("id, ref, parse_status").eq("agency_id", ctx.agencyId).eq("role_id", roleId),
    admin
      .from("submissions")
      .select("id, snapshot, generated_at")
      .eq("agency_id", ctx.agencyId)
      .eq("role_id", roleId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("handover_packs")
      .select("generated_at, delivered_at")
      .eq("agency_id", ctx.agencyId)
      .eq("role_id", roleId)
      .order("generated_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin.from("role_briefs").select("contact_id").eq("agency_id", ctx.agencyId).eq("role_id", roleId).maybeSingle(),
    listRoundsForRole(ctx, roleId),
    listOpenSlots(ctx, roleId),
  ])
  for (const r of [requirements, candidates, submission, packs, brief]) if (r.error) throw r.error

  const candidateRows = candidates.data ?? []
  const candidateIds = candidateRows.map((c) => c.id as string)
  const readable = candidateRows.filter((c) => c.parse_status !== "failed")
  const failures = candidateRows.length - readable.length

  const [reviews, decisions] = candidateIds.length
    ? await Promise.all([
        admin.from("candidate_reviews").select("candidate_id, status").eq("agency_id", ctx.agencyId).in("candidate_id", candidateIds),
        admin.from("recruiter_reviews").select("candidate_id, decision").eq("agency_id", ctx.agencyId).in("candidate_id", candidateIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]
  if (reviews.error) throw reviews.error
  if (decisions.error) throw decisions.error
  const reviewedIds = new Set((reviews.data ?? []).filter((r) => r.status === "reviewed").map((r) => r.candidate_id as string))
  const decidedIds = new Set((decisions.data ?? []).filter((d) => d.decision).map((d) => d.candidate_id as string))
  const reviewed = readable.filter((c) => reviewedIds.has(c.id as string))
  const undecided = reviewed.filter((c) => !decidedIds.has(c.id as string)).length

  // The client's signals on the shortlist: any action counts as "decided",
  // interview/approve as "advanced". Keyed by candidate ref, which is what
  // client_actions carries (it survives purge; the id does not).
  let submissionFacts: RoleFacts["submission"] = null
  if (submission.data) {
    const snapshot = (submission.data.snapshot ?? {}) as { shortlisted?: SnapshotEntry[] }
    const submittedRefs = new Set((snapshot.shortlisted ?? []).map((e) => e.ref).filter((r): r is string => !!r))
    const { data: recipients } = await admin
      .from("submission_recipients")
      .select("id")
      .eq("agency_id", ctx.agencyId)
      .eq("submission_id", submission.data.id as string)
    const recipientIds = (recipients ?? []).map((r) => r.id as string)
    const { data: actions } = recipientIds.length
      ? await admin
          .from("client_actions")
          .select("candidate_ref, action, created_at")
          .eq("agency_id", ctx.agencyId)
          .in("recipient_id", recipientIds)
          .order("created_at", { ascending: false })
      : { data: [] }
    const acted = new Set<string>()
    const advanced = new Set<string>()
    let lastActionAt: string | null = null
    for (const a of actions ?? []) {
      const ref = (a.candidate_ref as string) ?? ""
      if (!ref) continue
      acted.add(ref)
      if (a.action === "interview" || a.action === "approve") advanced.add(ref)
      if (!lastActionAt) lastActionAt = (a.created_at as string) ?? null
    }
    submissionFacts = {
      generatedAt: submission.data.generated_at as string,
      submitted: submittedRefs.size,
      decided: [...acted].filter((r) => submittedRefs.has(r)).length,
      advanced: [...advanced].filter((r) => submittedRefs.has(r)).length,
      lastActionAt,
    }
  }

  const roundFacts: RoundFacts[] = rounds.map((r) => {
    const endsAt =
      r.scheduledAt && Number.isFinite(Date.parse(r.scheduledAt))
        ? new Date(Date.parse(r.scheduledAt) + r.durationMinutes * 60_000).toISOString()
        : null
    return {
      candidateRef: r.candidateRef,
      roundNumber: r.roundNumber,
      status: r.status,
      createdAt: r.createdAt,
      scheduledAt: r.scheduledAt,
      endsAt,
      candidateResponse: r.candidateResponse,
      hasDebrief: r.hasDebrief,
      decision: (r.clientDecision?.decision as RoundFacts["decision"]) ?? null,
      decidedAt: r.clientDecision?.decidedAt ?? null,
    }
  })

  // Names. The owner lives in public.profiles, which the agency-bound client
  // cannot cross into; the client contact is this agency's own row.
  const ownerId = (role.owner_id as string | null) ?? null
  let ownerName: string | null = null
  if (ownerId) {
    // Name only. An email is not a name, and this value reaches the client's
    // header too — "Your recruiter" is the honest fallback.
    const { data: profile } = await createAdminClient().from("profiles").select("full_name").eq("id", ownerId).maybeSingle()
    ownerName = (profile?.full_name as string) || null
  }
  let clientName: string | null = null
  const contactId = (brief.data?.contact_id as string | null) ?? null
  if (contactId) {
    const { data: contact } = await admin.from("client_contacts").select("full_name").eq("agency_id", ctx.agencyId).eq("id", contactId).maybeSingle()
    clientName = (contact?.full_name as string) || null
  }

  // The most recent offer, not the earliest window: the wait to book opened
  // when the client last gave times.
  const lastWindowOfferedAt = openSlots.length
    ? openSlots.map((s) => s.offeredAt).sort().at(-1) ?? null
    : null

  return {
    roleId: role.id as string,
    ref: role.ref as string,
    title: role.title as string,
    company: (role.company as string) ?? "",
    ownerId,
    phase: derivePhase({ hasSubmission: !!submission.data, hasHandoverPack: !!packs.data }),
    status: role.status as RoleFacts["status"],
    createdAt: role.created_at as string,
    closedAt: (role.closed_at as string | null) ?? null,
    ownerName,
    clientName,
    requirements: (requirements.data ?? []).length,
    candidates: readable.length,
    failures,
    reviewed: reviewed.length,
    undecided,
    submission: submissionFacts,
    openWindows: openSlots.length,
    lastWindowOfferedAt,
    plannedRounds: (role.planned_rounds as number | null) ?? 2,
    rounds: roundFacts,
    pack: packs.data
      ? { generatedAt: packs.data.generated_at as string, deliveredAt: (packs.data.delivered_at as string | null) ?? null }
      : null,
    now,
  }
}
