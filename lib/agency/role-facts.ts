/**
 * The facts a role carries, assembled for the next-action ladder.
 *
 * Server-side and service-role, because the facts span tables the browser
 * never reads directly (rounds, decisions, packs, slots). Nothing here
 * interprets: every field is a count, a timestamp or an enum straight from a
 * row, and lib/agency/next-action.ts does the reading. That split is the
 * point — the dashboard, the header and the queue all consume the same facts
 * and the same ladder, so no screen can disagree with another about where a
 * role stands.
 *
 * ONE ASSEMBLER, BATCHED (10 Sep 2026). It used to be one function that ran
 * about a dozen queries for a single role, and the queue called it once per
 * role in a loop: twenty open roles meant several hundred round trips before
 * the dashboard could paint, which is exactly the slowness Ose reported. The
 * assembler is now `getRoleFactsBatch`, which runs each table ONCE with an
 * `in (…)` and groups in memory, and `getRoleFacts` is a one-role call into
 * it. Adding a fact means adding one query here, never one per role.
 *
 * If you find yourself writing `for (const id of roleIds) await getRoleFacts(…)`
 * you are re-introducing the bug this file was rewritten to remove.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { latestCompletions } from "./decision-completions"
import { agencyAdmin } from "./db"
import type { AgencyContext } from "./types"
import { derivePhase } from "./phases"
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

/** Group rows by a key, preserving order. */
function groupBy<T>(rows: T[], key: (row: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    if (!k) continue
    const list = out.get(k)
    if (list) list.push(row)
    else out.set(k, [row])
  }
  return out
}

/**
 * The facts for many roles, in a fixed number of queries.
 *
 * Returns a Map keyed by role id. A role id that is not in the caller's
 * agency is simply absent from the map, never an error — the caller decides
 * whether a missing role is a 404 or a row to skip.
 */
export async function getRoleFactsBatch(
  ctx: AgencyContext,
  roleIds: string[],
  now: string = new Date().toISOString()
): Promise<Map<string, RoleHeaderFacts>> {
  const out = new Map<string, RoleHeaderFacts>()
  const ids = [...new Set(roleIds.filter(Boolean))]
  if (ids.length === 0) return out

  const admin = agencyAdmin()

  const { data: roles, error: roleErr } = await admin
    .from("job_roles")
    .select("id, ref, title, company, status, closed_at, created_at, owner_id, planned_rounds, contact_id")
    .eq("agency_id", ctx.agencyId)
    .in("id", ids)
  if (roleErr) throw roleErr
  const roleRows = roles ?? []
  if (roleRows.length === 0) return out
  const liveIds = roleRows.map((r) => r.id as string)

  // ── One pass per table, never one per role ─────────────────────────────
  const [requirements, candidates, submissions, packs, briefs, rounds, slots, takenSlots] = await Promise.all([
    admin.from("requirements").select("id, role_id").eq("agency_id", ctx.agencyId).in("role_id", liveIds),
    admin.from("candidates").select("id, ref, role_id, parse_status").eq("agency_id", ctx.agencyId).in("role_id", liveIds),
    admin
      .from("submissions")
      .select("id, role_id, snapshot, generated_at")
      .eq("agency_id", ctx.agencyId)
      .in("role_id", liveIds)
      .order("generated_at", { ascending: false }),
    admin
      .from("handover_packs")
      .select("role_id, generated_at, delivered_at")
      .eq("agency_id", ctx.agencyId)
      .in("role_id", liveIds)
      .order("generated_at", { ascending: true }),
    admin.from("role_briefs").select("role_id, contact_id").eq("agency_id", ctx.agencyId).in("role_id", liveIds),
    admin
      .from("interview_rounds")
      .select("id, role_id, candidate_id, round_number, scheduled_at, duration_minutes, status, candidate_response, created_at, slot_id")
      .eq("agency_id", ctx.agencyId)
      .in("role_id", liveIds)
      .order("scheduled_at", { ascending: true, nullsFirst: false }),
    // Slots are agency-wide: one offered against no role is on offer for
    // every role, which is why this is not filtered by role_id here.
    admin
      .from("availability_slots")
      .select("id, role_id, starts_at, created_at")
      .eq("agency_id", ctx.agencyId)
      .is("revoked_at", null)
      .gt("ends_at", now),
    admin
      .from("interview_rounds")
      .select("slot_id")
      .eq("agency_id", ctx.agencyId)
      .neq("status", "cancelled")
      .not("slot_id", "is", null),
  ])
  for (const r of [requirements, candidates, submissions, packs, briefs, rounds, slots, takenSlots]) {
    if (r.error) throw r.error
  }

  const candidateRows = candidates.data ?? []
  const roundRows = rounds.data ?? []
  const submissionRows = submissions.data ?? []

  // Only the newest submission and the earliest pack per role matter; the
  // ordering above means the first row seen for a role is the right one.
  const latestSubmission = new Map<string, (typeof submissionRows)[number]>()
  for (const s of submissionRows) {
    const rid = s.role_id as string
    if (!latestSubmission.has(rid)) latestSubmission.set(rid, s)
  }
  const firstPack = new Map<string, { generated_at: string; delivered_at: string | null }>()
  for (const p of packs.data ?? []) {
    const rid = p.role_id as string
    if (!firstPack.has(rid)) {
      firstPack.set(rid, { generated_at: p.generated_at as string, delivered_at: (p.delivered_at as string | null) ?? null })
    }
  }

  const allCandidateIds = candidateRows.map((c) => c.id as string)
  const allRoundIds = roundRows.map((r) => r.id as string)
  const allSubmissionIds = [...latestSubmission.values()].map((s) => s.id as string)

  const [reviews, decisions, recipients, roundDecisions, debriefs] = await Promise.all([
    allCandidateIds.length
      ? admin.from("candidate_reviews").select("candidate_id, status").eq("agency_id", ctx.agencyId).in("candidate_id", allCandidateIds)
      : Promise.resolve({ data: [], error: null }),
    allCandidateIds.length
      ? admin.from("recruiter_reviews").select("candidate_id, decision").eq("agency_id", ctx.agencyId).in("candidate_id", allCandidateIds)
      : Promise.resolve({ data: [], error: null }),
    allSubmissionIds.length
      ? admin.from("submission_recipients").select("id, submission_id").eq("agency_id", ctx.agencyId).in("submission_id", allSubmissionIds)
      : Promise.resolve({ data: [], error: null }),
    allRoundIds.length
      ? admin
          .from("round_decisions")
          .select("round_id, decision, created_at")
          .eq("agency_id", ctx.agencyId)
          .in("round_id", allRoundIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    // kind='debrief' is load-bearing — the other kind is 'transcript', which
    // exists only where the candidate consented, so an unfiltered read would
    // leak consent by inference.
    allRoundIds.length
      ? admin.from("round_artifacts").select("round_id").eq("agency_id", ctx.agencyId).eq("kind", "debrief").in("round_id", allRoundIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const r of [reviews, decisions, recipients, roundDecisions, debriefs]) if (r.error) throw r.error

  const recipientRows = recipients.data ?? []
  const allRecipientIds = recipientRows.map((r) => r.id as string)
  const { data: actionRows, error: actionErr } = allRecipientIds.length
    ? await admin
        .from("client_actions")
        .select("recipient_id, candidate_ref, action, created_at")
        .eq("agency_id", ctx.agencyId)
        .in("recipient_id", allRecipientIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null }
  if (actionErr) throw actionErr

  // Names. The owner lives in public.profiles, which the agency-bound client
  // cannot cross into; the client contact is this agency's own row.
  const briefByRole = new Map((briefs.data ?? []).map((b) => [b.role_id as string, (b.contact_id as string | null) ?? null]))
  const ownerIds = [...new Set(roleRows.map((r) => r.owner_id as string | null).filter((v): v is string => !!v))]
  const contactIds = [
    ...new Set(
      roleRows
        .map((r) => (r.contact_id as string | null) ?? briefByRole.get(r.id as string) ?? null)
        .filter((v): v is string => !!v)
    ),
  ]
  const [profiles, contacts] = await Promise.all([
    ownerIds.length
      ? createAdminClient().from("profiles").select("id, full_name").in("id", ownerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }>, error: null }),
    contactIds.length
      ? admin.from("client_contacts").select("id, full_name").eq("agency_id", ctx.agencyId).in("id", contactIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }>, error: null }),
  ])
  // Name only. An email is not a name, and this value reaches the client's
  // header too — "Your recruiter" is the honest fallback.
  type NameRow = { id: string; full_name: string | null }
  const ownerNames = new Map<string, string | null>()
  for (const row of (profiles.data ?? []) as NameRow[]) ownerNames.set(row.id, row.full_name || null)
  const contactNames = new Map<string, string | null>()
  for (const row of (contacts.data ?? []) as NameRow[]) contactNames.set(row.id, row.full_name || null)

  // ── Group everything, then read one role at a time from memory ─────────
  const reqByRole = groupBy(requirements.data ?? [], (r) => r.role_id as string)
  const candByRole = groupBy(candidateRows, (c) => c.role_id as string)
  const roundsByRole = groupBy(roundRows, (r) => r.role_id as string)
  const recipientsBySubmission = groupBy(recipientRows, (r) => r.submission_id as string)
  const actionsByRecipient = groupBy(actionRows ?? [], (a) => a.recipient_id as string)

  const candidateRefById = new Map(candidateRows.map((c) => [c.id as string, (c.ref as string) ?? ""]))
  const reviewedIds = new Set((reviews.data ?? []).filter((r) => r.status === "reviewed").map((r) => r.candidate_id as string))
  const decidedIds = new Set((decisions.data ?? []).filter((d) => d.decision).map((d) => d.candidate_id as string))
  const debriefedRounds = new Set((debriefs.data ?? []).map((d) => d.round_id as string))
  const latestRoundDecision = new Map<string, { decision: string; decidedAt: string }>()
  for (const d of roundDecisions.data ?? []) {
    const rid = d.round_id as string
    if (!latestRoundDecision.has(rid)) {
      latestRoundDecision.set(rid, { decision: d.decision as string, decidedAt: d.created_at as string })
    }
  }

  const takenSlotIds = new Set((takenSlots.data ?? []).map((r) => r.slot_id as string))
  const freeSlots = (slots.data ?? []).filter((s) => !takenSlotIds.has(s.id as string))

  // One read for the batch, not one per role — see the note at the top of
  // this file about the N+1 this module exists to prevent.
  const completions = await latestCompletions(admin, ctx.agencyId, ids)

  for (const role of roleRows) {
    const roleId = role.id as string

    const roleCandidates = candByRole.get(roleId) ?? []
    const readable = roleCandidates.filter((c) => c.parse_status !== "failed")
    const failures = roleCandidates.length - readable.length
    const reviewed = readable.filter((c) => reviewedIds.has(c.id as string))
    const undecided = reviewed.filter((c) => !decidedIds.has(c.id as string)).length

    // The client's signals on the shortlist: any action counts as "decided",
    // interview/approve as "advanced". Keyed by candidate ref, which is what
    // client_actions carries (it survives purge; the id does not).
    let submissionFacts: RoleFacts["submission"] = null
    const submission = latestSubmission.get(roleId)
    if (submission) {
      const snapshot = (submission.snapshot ?? {}) as { shortlisted?: SnapshotEntry[] }
      const submittedRefs = new Set((snapshot.shortlisted ?? []).map((e) => e.ref).filter((r): r is string => !!r))
      const acted = new Set<string>()
      const advanced = new Set<string>()
      let lastActionAt: string | null = null
      for (const recipient of recipientsBySubmission.get(submission.id as string) ?? []) {
        for (const a of actionsByRecipient.get(recipient.id as string) ?? []) {
          const ref = (a.candidate_ref as string) ?? ""
          if (!ref) continue
          acted.add(ref)
          if (a.action === "interview" || a.action === "approve") advanced.add(ref)
          const at = (a.created_at as string) ?? null
          if (at && (!lastActionAt || at > lastActionAt)) lastActionAt = at
        }
      }
      submissionFacts = {
        generatedAt: submission.generated_at as string,
        submitted: submittedRefs.size,
        decided: [...acted].filter((r) => submittedRefs.has(r)).length,
        advanced: [...advanced].filter((r) => submittedRefs.has(r)).length,
        lastActionAt,
      }
    }

    const roundFacts: RoundFacts[] = (roundsByRole.get(roleId) ?? []).map((r) => {
      const scheduledAt = (r.scheduled_at as string | null) ?? null
      const duration = (r.duration_minutes as number | null) ?? 45
      const endsAt =
        scheduledAt && Number.isFinite(Date.parse(scheduledAt))
          ? new Date(Date.parse(scheduledAt) + duration * 60_000).toISOString()
          : null
      const decision = latestRoundDecision.get(r.id as string)
      return {
        candidateRef: candidateRefById.get(r.candidate_id as string) ?? "",
        roundNumber: (r.round_number as number) ?? 1,
        status: r.status as RoundFacts["status"],
        createdAt: r.created_at as string,
        scheduledAt,
        endsAt,
        candidateResponse: (r.candidate_response as RoundFacts["candidateResponse"]) ?? null,
        hasDebrief: debriefedRounds.has(r.id as string),
        decision: (decision?.decision as RoundFacts["decision"]) ?? null,
        decidedAt: decision?.decidedAt ?? null,
      }
    })

    // A slot offered against one role is not on offer for another; a slot
    // offered against none is on offer for all.
    const openSlots = freeSlots.filter((s) => !s.role_id || s.role_id === roleId)
    // The most recent offer, not the earliest window: the wait to book opened
    // when the client last gave times.
    const offeredAt = openSlots.map((s) => String(s.created_at ?? "")).filter(Boolean).sort()
    const lastWindowOfferedAt: string | null = offeredAt.length ? offeredAt[offeredAt.length - 1] : null

    const ownerId = (role.owner_id as string | null) ?? null
    // The contact set at intake first (the brief is the recruiter's now),
    // then the one on a client-written brief.
    const contactId = (role.contact_id as string | null) ?? briefByRole.get(roleId) ?? null

    out.set(roleId, {
      roleId,
      ref: role.ref as string,
      title: role.title as string,
      company: (role.company as string) ?? "",
      ownerId,
      phase: derivePhase({ hasSubmission: !!submission, hasHandoverPack: !!firstPack.get(roleId) }),
      status: role.status as RoleFacts["status"],
      createdAt: role.created_at as string,
      closedAt: (role.closed_at as string | null) ?? null,
      ownerName: ownerId ? ownerNames.get(ownerId) ?? null : null,
      clientName: contactId ? contactNames.get(contactId) ?? null : null,
      requirements: (reqByRole.get(roleId) ?? []).length,
      candidates: readable.length,
      failures,
      reviewed: reviewed.length,
      undecided,
      decisionsCompleteAt: completions.get(roleId) ?? null,
      submission: submissionFacts,
      openWindows: openSlots.length,
      lastWindowOfferedAt,
      plannedRounds: (role.planned_rounds as number | null) ?? 2,
      rounds: roundFacts,
      pack: firstPack.get(roleId)
        ? { generatedAt: firstPack.get(roleId)!.generated_at, deliveredAt: firstPack.get(roleId)!.delivered_at }
        : null,
      now,
    })
  }

  return out
}

/** One role's facts. A thin call into the batch, so there is one assembler. */
export async function getRoleFacts(
  ctx: AgencyContext,
  roleId: string,
  now: string = new Date().toISOString()
): Promise<RoleHeaderFacts | null> {
  const batch = await getRoleFactsBatch(ctx, [roleId], now)
  return batch.get(roleId) ?? null
}
