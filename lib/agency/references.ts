/**
 * References — and the referees, who are data subjects nobody asked.
 *
 * A candidate names a referee; that referee never applied for anything and has
 * no relationship with Tailr or the agency. Their name, email and words are
 * personal data collected from a third party, so `notice_sent_at` is a column
 * rather than a hope: the fair-processing notice goes out WITH the request, in
 * the same operation, and the request cannot be sent without it.
 *
 * The reply comes back through a raw-once token, exactly like the portal and
 * the consent page — a referee should never need an account to answer a
 * question about someone else.
 *
 * Their words are stored verbatim and attributed. A reference that has been
 * summarised is a reference nobody can stand behind.
 */

import { createHash, randomBytes } from "crypto"
import { agencyAdmin, assertWriter, writeAudit, AgencyAccessError } from "./db"
import type { AgencyContext } from "./types"

export type ReferenceStatus = "drafted" | "requested" | "received" | "chasing" | "declined"

const MAX_NAME = 200
const MAX_ANSWER = 4000

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}
function tokenLooksPlausible(raw: string): boolean {
  return typeof raw === "string" && raw.length >= 16 && raw.length <= 64
}
function cap(s: string | undefined | null, max: number): string {
  return (s ?? "").trim().slice(0, max)
}

export interface ReferenceRow {
  id: string
  candidateId: string
  candidateRef: string
  refereeName: string
  refereeEmail: string
  relationship: string
  status: ReferenceStatus
  noticeSentAt: string | null
  receivedAt: string | null
}

export async function listReferences(
  ctx: AgencyContext,
  candidateId: string
): Promise<ReferenceRow[]> {
  const admin = agencyAdmin()
  const { data, error } = await admin
    .from("candidate_references")
    .select(
      "id, candidate_id, candidate_ref, referee_name, referee_email, relationship, status, notice_sent_at, received_at"
    )
    .eq("agency_id", ctx.agencyId)
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    candidateId: r.candidate_id as string,
    candidateRef: (r.candidate_ref as string) ?? "",
    refereeName: (r.referee_name as string) ?? "",
    refereeEmail: (r.referee_email as string) ?? "",
    relationship: (r.relationship as string) ?? "",
    status: (r.status as ReferenceStatus) ?? "drafted",
    noticeSentAt: (r.notice_sent_at as string | null) ?? null,
    receivedAt: (r.received_at as string | null) ?? null,
  }))
}

export interface AddRefereeInput {
  candidateId: string
  refereeName: string
  refereeEmail: string
  relationship?: string
}

/** Record a referee the candidate has named. Nothing is sent yet. */
export async function addReferee(
  ctx: AgencyContext,
  input: AddRefereeInput
): Promise<{ referenceId: string }> {
  assertWriter(ctx)
  const admin = agencyAdmin()

  const { data: candidate } = await admin
    .from("candidates")
    .select("id, ref")
    .eq("id", input.candidateId)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle()
  if (!candidate) throw new AgencyAccessError("candidate not found in your agency")

  const name = cap(input.refereeName, MAX_NAME)
  const email = cap(input.refereeEmail, MAX_NAME).toLowerCase()
  if (!name || !email) throw new Error("a referee needs a name and an email address")

  const { data, error } = await admin
    .from("candidate_references")
    .insert({
      agency_id: ctx.agencyId,
      candidate_id: input.candidateId,
      candidate_ref: (candidate.ref as string) ?? "",
      referee_name: name,
      referee_email: email,
      relationship: cap(input.relationship, MAX_NAME),
      status: "drafted",
      created_by: ctx.userId,
    })
    .select("id")
    .single()
  if (error) throw error

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    candidateId: input.candidateId,
    actorId: ctx.userId,
    entityType: "reference",
    entityRef: (candidate.ref as string) ?? "",
    action: "referee_added",
    // The referee's name and address stay out of the log; they are a third
    // party whose data we hold on the thinnest possible basis.
    toValue: { reference_id: data.id as string },
  })

  return { referenceId: data.id as string }
}

export interface ReferenceRequest {
  rawToken: string
  refereeName: string
  refereeEmail: string
  candidateName: string
  agencyName: string
  isChase: boolean
}

/**
 * Mint the referee's link.
 *
 * Returns everything the caller needs to send the request AND the notice in one
 * email — they are the same email, deliberately. A separate "by the way, we
 * hold your data" message would arrive after the ask, which is the wrong order.
 * `notice_sent_at` is stamped here, so the record cannot claim a notice went
 * out unless this ran.
 */
export async function requestReference(
  ctx: AgencyContext,
  referenceId: string
): Promise<ReferenceRequest> {
  assertWriter(ctx)
  const admin = agencyAdmin()

  const { data: ref, error } = await admin
    .from("candidate_references")
    .select("id, agency_id, candidate_id, referee_name, referee_email, status, notice_sent_at")
    .eq("id", referenceId)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle()
  if (error) throw error
  if (!ref) throw new AgencyAccessError("reference not found in your agency")
  if (ref.status === "received") {
    throw new AgencyAccessError("that reference is already in")
  }
  if (ref.status === "declined") {
    throw new AgencyAccessError("that referee declined — asking again is a conversation, not a link")
  }

  const isChase = ref.status === "requested" || ref.status === "chasing"
  const raw = randomBytes(24).toString("base64url")

  const { error: updateError } = await admin
    .from("candidate_references")
    .update({
      request_token_hash: hashToken(raw),
      status: isChase ? "chasing" : "requested",
      // Stamped once, on the first ask. A chase is not a new notice.
      notice_sent_at: (ref.notice_sent_at as string | null) ?? new Date().toISOString(),
    })
    .eq("id", referenceId)
    .eq("agency_id", ctx.agencyId)
  if (updateError) throw updateError

  const [{ data: candidate }, { data: agency }] = await Promise.all([
    admin.from("candidates").select("full_name, ref").eq("id", ref.candidate_id as string).maybeSingle(),
    admin.from("agencies").select("name").eq("id", ctx.agencyId).maybeSingle(),
  ])

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    candidateId: ref.candidate_id as string,
    actorId: ctx.userId,
    entityType: "reference",
    entityRef: (candidate?.ref as string) ?? "",
    action: isChase ? "reference_chased" : "reference_requested",
    toValue: { reference_id: referenceId, notice_sent: true },
  })

  return {
    rawToken: raw,
    refereeName: (ref.referee_name as string) ?? "",
    refereeEmail: (ref.referee_email as string) ?? "",
    candidateName: (candidate?.full_name as string) ?? "the candidate",
    agencyName: (agency?.name as string) ?? "the agency",
    isChase,
  }
}

export interface RefereeView {
  agencyName: string
  candidateName: string
  refereeName: string
  relationship: string
  status: ReferenceStatus
}

/** What the referee's page renders. Token only — no account, ever. */
export async function peekReference(rawToken: string): Promise<RefereeView | null> {
  if (!tokenLooksPlausible(rawToken)) return null
  const admin = agencyAdmin()

  const { data: ref, error } = await admin
    .from("candidate_references")
    .select("id, agency_id, candidate_id, referee_name, relationship, status")
    .eq("request_token_hash", hashToken(rawToken))
    .maybeSingle()
  if (error) throw error
  if (!ref) return null

  const [{ data: candidate }, { data: agency }] = await Promise.all([
    admin.from("candidates").select("full_name").eq("id", ref.candidate_id as string).maybeSingle(),
    admin.from("agencies").select("name").eq("id", ref.agency_id as string).maybeSingle(),
  ])

  return {
    agencyName: (agency?.name as string) ?? "the agency",
    candidateName: (candidate?.full_name as string) ?? "the candidate",
    refereeName: (ref.referee_name as string) ?? "",
    relationship: (ref.relationship as string) ?? "",
    status: (ref.status as ReferenceStatus) ?? "requested",
  }
}

export interface RefereeAnswer {
  key: string
  question: string
  answer: string
}

/**
 * The referee's reply, in their words.
 *
 * Verbatim and attributed; nothing here summarises or scores. A referee may
 * also decline outright, which is recorded as a state rather than treated as
 * silence — silence and refusal mean different things to a recruiter.
 */
export async function recordReference(
  rawToken: string,
  input: { answers?: RefereeAnswer[]; decline?: boolean }
): Promise<{ ok: true; declined: boolean } | null> {
  if (!tokenLooksPlausible(rawToken)) return null
  const admin = agencyAdmin()

  const { data: ref, error } = await admin
    .from("candidate_references")
    .select("id, agency_id, candidate_id, candidate_ref, status")
    .eq("request_token_hash", hashToken(rawToken))
    .maybeSingle()
  if (error) throw error
  if (!ref) return null
  if (ref.status === "received" || ref.status === "declined") return null

  const declined = input.decline === true
  const answers = (input.answers ?? [])
    .filter((a) => a && typeof a.key === "string" && a.key.length > 0 && a.key.length <= 10)
    .slice(0, 20)
    .map((a) => ({
      key: a.key,
      question: cap(a.question, 500),
      answer: cap(a.answer, MAX_ANSWER),
    }))

  const { error: updateError } = await admin
    .from("candidate_references")
    .update({
      status: declined ? "declined" : "received",
      content: declined ? { declined: true } : { answers },
      received_at: new Date().toISOString(),
      // The link is spent either way.
      request_token_hash: null,
    })
    .eq("id", ref.id as string)
  if (updateError) throw updateError

  await writeAudit(admin, {
    agencyId: ref.agency_id as string,
    candidateId: ref.candidate_id as string,
    // The referee is not an auth user and never will be.
    actorId: null,
    entityType: "reference",
    entityRef: (ref.candidate_ref as string) ?? "",
    action: declined ? "reference_declined" : "reference_received",
    reason: "referee reply",
    toValue: { reference_id: ref.id as string, answered: answers.length },
  })

  return { ok: true, declined }
}
