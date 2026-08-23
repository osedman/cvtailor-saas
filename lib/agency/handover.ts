/**
 * The handover pack — the last thing Tailr produces, and the moment it stops
 * being the point.
 *
 * When a client picks someone, the agency hands the hiring employer what they
 * need to onboard: the evidence dossier, the interview history, the references
 * as given, and the agreed logistics. After that the employer is the controller
 * of what they hold, and the role's retention clock starts on everyone else.
 *
 * Submission discipline, end-of-loop edition (AGENCIES_SCHEMA.md §5.5):
 *   - the snapshot is frozen at generation and never re-derived at read time,
 *     so what was handed over cannot quietly change afterwards;
 *   - `candidate_id` is set-null with a denormalised ref, so the pack survives
 *     the candidate's purge as a business record while the PII inside it lives
 *     only in the copy the employer already lawfully holds;
 *   - delivery is in-app to the deciding contact only — no recipient tokens in
 *     v1 (§5.5), which keeps exactly one person accountable for onward sharing.
 *
 * The confidentiality footer is not decoration. It is the same promise the
 * client document carries, in the one artefact that leaves the building for
 * good — and it has been dropped once already during a layout rebuild.
 */

import { agencyAdmin, assertWriter, writeAudit, AgencyAccessError } from "./db"
import type { AgencyContext } from "./types"

export const HANDOVER_ENGINE = "handover-1"

export const HANDOVER_FOOTER =
  "Confidential — prepared for the named employer. Scores trace to evidence; " +
  "nobody in this process was auto-rejected."

export interface HandoverSnapshot {
  role: { ref: string; title: string; company: string; location: string }
  candidate: { ref: string; name: string }
  agency: string
  evidence: Array<{
    requirement: string
    weight: string
    strength: string
    quote: string | null
    source: string
  }>
  rounds: Array<{
    number: number
    when: string | null
    status: string
    /** 'transcript' | 'debrief' | null — how this round was recorded, so the
     * employer knows the provenance of every quote above. */
    artifact: string | null
    decision: string | null
  }>
  references: Array<{
    referee: string
    relationship: string
    status: string
    answers: Array<{ question: string; answer: string }>
  }>
  gaps: Array<{ requirement: string; weight: string }>
  generated_at: string
  footer: string
}

/**
 * Build and freeze the pack.
 *
 * Everything is read at this moment and written into the snapshot. Nothing here
 * reads back through a live join later — that is the whole point of a snapshot,
 * and the reason the client submission works the same way.
 */
export async function generateHandoverPack(
  ctx: AgencyContext,
  input: { roleId: string; candidateId: string; contactId?: string | null }
): Promise<{
  packId: string
  snapshot: HandoverSnapshot
  deliveredToContactId?: string | null
  deliveredAt?: string | null
}> {
  assertWriter(ctx)
  const admin = agencyAdmin()

  // Frozen means frozen. If a pack already exists for this candidate on this
  // role, return THAT — never re-derive. Without this, reloading close-out
  // (which holds the pack only in component state) and pressing generate again
  // minted a second, later-dated "frozen" pack, which is two different
  // versions of a thing whose whole promise is that there is exactly one.
  const { data: existing } = await admin
    .from("handover_packs")
    .select("id, snapshot, delivered_to_contact_id, delivered_at")
    .eq("agency_id", ctx.agencyId)
    .eq("role_id", input.roleId)
    .eq("candidate_id", input.candidateId)
    .order("generated_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing) {
    return {
      packId: existing.id as string,
      snapshot: existing.snapshot as HandoverSnapshot,
      deliveredToContactId: (existing.delivered_to_contact_id as string | null) ?? null,
      deliveredAt: (existing.delivered_at as string | null) ?? null,
    }
  }

  const [{ data: role }, { data: candidate }, { data: agency }] = await Promise.all([
    admin
      .from("job_roles")
      .select("id, ref, title, company, location")
      .eq("id", input.roleId)
      .eq("agency_id", ctx.agencyId)
      .maybeSingle(),
    admin
      .from("candidates")
      .select("id, ref, full_name, role_id")
      .eq("id", input.candidateId)
      .eq("agency_id", ctx.agencyId)
      .maybeSingle(),
    admin.from("agencies").select("name").eq("id", ctx.agencyId).maybeSingle(),
  ])
  if (!role) throw new AgencyAccessError("role not found in your agency")
  if (!candidate || candidate.role_id !== input.roleId) {
    throw new AgencyAccessError("candidate not found on that role")
  }

  // Requirements first, so evidence can be named rather than referenced.
  const { data: requirements } = await admin
    .from("requirements")
    .select("id, ref, text, weight")
    .eq("role_id", input.roleId)
    .order("sort_order", { ascending: true })
  const reqById = new Map(
    (requirements ?? []).map((r) => [
      r.id as string,
      { ref: (r.ref as string) ?? "", text: (r.text as string) ?? "", weight: (r.weight as string) ?? "" },
    ])
  )

  const { data: evidenceRows } = await admin
    .from("candidate_evidence")
    .select("requirement_id, strength, quote, source_cite, origin")
    .eq("candidate_id", input.candidateId)

  const evidence: HandoverSnapshot["evidence"] = []
  const gaps: HandoverSnapshot["gaps"] = []
  for (const e of evidenceRows ?? []) {
    const req = reqById.get(e.requirement_id as string)
    if (!req) continue
    if ((e.strength as string) === "missing") {
      // Gaps are stated plainly rather than omitted. An employer inheriting
      // this person is entitled to know what was never evidenced.
      gaps.push({ requirement: req.text, weight: req.weight })
      continue
    }
    evidence.push({
      requirement: req.text,
      weight: req.weight,
      strength: e.strength as string,
      quote: (e.quote as string | null) ?? null,
      source: (e.source_cite as string) ?? (e.origin as string) ?? "",
    })
  }

  const { data: roundRows } = await admin
    .from("interview_rounds")
    .select("id, round_number, scheduled_at, status")
    .eq("role_id", input.roleId)
    .eq("candidate_id", input.candidateId)
    .neq("status", "cancelled")
    .order("round_number", { ascending: true })

  const roundIds = (roundRows ?? []).map((r) => r.id as string)
  const [{ data: artifacts }, { data: decisions }] = await Promise.all([
    roundIds.length
      ? admin.from("round_artifacts").select("round_id, kind").in("round_id", roundIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    roundIds.length
      ? admin
          .from("round_decisions")
          .select("round_id, decision, created_at")
          .in("round_id", roundIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ])
  const kindByRound = new Map((artifacts ?? []).map((a) => [a.round_id as string, a.kind as string]))
  // Append-only decisions: the newest per round wins, and the order above
  // guarantees the first one seen is the newest.
  const decisionByRound = new Map<string, string>()
  for (const d of decisions ?? []) {
    const rid = d.round_id as string
    if (!decisionByRound.has(rid)) decisionByRound.set(rid, d.decision as string)
  }

  const rounds: HandoverSnapshot["rounds"] = (roundRows ?? []).map((r) => ({
    number: r.round_number as number,
    when: (r.scheduled_at as string | null) ?? null,
    status: r.status as string,
    artifact: kindByRound.get(r.id as string) ?? null,
    decision: decisionByRound.get(r.id as string) ?? null,
  }))

  const { data: refRows } = await admin
    .from("candidate_references")
    .select("referee_name, relationship, status, content")
    .eq("candidate_id", input.candidateId)
    .eq("agency_id", ctx.agencyId)

  const references: HandoverSnapshot["references"] = (refRows ?? []).map((r) => {
    const content = (r.content ?? {}) as { answers?: Array<{ question: string; answer: string }> }
    return {
      referee: (r.referee_name as string) ?? "",
      relationship: (r.relationship as string) ?? "",
      status: (r.status as string) ?? "",
      // Verbatim, as given. An outstanding reference stays visibly outstanding
      // rather than being quietly dropped from the pack.
      answers: (content.answers ?? []).map((a) => ({ question: a.question, answer: a.answer })),
    }
  })

  const snapshot: HandoverSnapshot = {
    role: {
      ref: (role.ref as string) ?? "",
      title: (role.title as string) ?? "",
      company: (role.company as string) ?? "",
      location: (role.location as string) ?? "",
    },
    candidate: {
      ref: (candidate.ref as string) ?? "",
      name: (candidate.full_name as string) ?? "",
    },
    agency: (agency?.name as string) ?? "",
    evidence,
    rounds,
    references,
    gaps,
    generated_at: new Date().toISOString(),
    footer: HANDOVER_FOOTER,
  }

  const { data: pack, error } = await admin
    .from("handover_packs")
    .insert({
      agency_id: ctx.agencyId,
      role_id: input.roleId,
      candidate_id: input.candidateId,
      candidate_ref: (candidate.ref as string) ?? "",
      snapshot,
      engine_version: HANDOVER_ENGINE,
      generated_by: ctx.userId,
      delivered_to_contact_id: input.contactId ?? null,
    })
    .select("id")
    .single()
  if (error) throw error

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId: input.roleId,
    candidateId: input.candidateId,
    actorId: ctx.userId,
    entityType: "handover",
    entityRef: (candidate.ref as string) ?? "",
    action: "generated",
    toValue: {
      pack_id: pack.id as string,
      evidence: evidence.length,
      gaps: gaps.length,
      rounds: rounds.length,
      references: references.length,
    },
  })

  return { packId: pack.id as string, snapshot, deliveredToContactId: null, deliveredAt: null }
}

/** Mark it handed over. From here the employer is the controller of the copy
 * they hold, and the role's retention clock is what governs everything left. */
export async function deliverHandoverPack(
  ctx: AgencyContext,
  packId: string,
  contactId: string
): Promise<void> {
  assertWriter(ctx)
  const admin = agencyAdmin()

  const { data: pack } = await admin
    .from("handover_packs")
    .select("id, agency_id, role_id, candidate_ref, delivered_at")
    .eq("id", packId)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle()
  if (!pack) throw new AgencyAccessError("pack not found in your agency")
  if (pack.delivered_at) return

  const { data: contact } = await admin
    .from("client_contacts")
    .select("id")
    .eq("id", contactId)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle()
  if (!contact) throw new AgencyAccessError("contact not found in your agency")

  const { error } = await admin
    .from("handover_packs")
    .update({ delivered_at: new Date().toISOString(), delivered_to_contact_id: contactId })
    .eq("id", packId)
    .eq("agency_id", ctx.agencyId)
  if (error) throw error

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId: pack.role_id as string,
    actorId: ctx.userId,
    entityType: "handover",
    entityRef: (pack.candidate_ref as string) ?? "",
    action: "delivered",
    toValue: { pack_id: packId, contact_id: contactId },
  })
}
