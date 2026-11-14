/**
 * "May we put you forward?" as its own email, and the rule that nobody's CV
 * reaches an employer before they have been told (frame 47 §E, signed off by
 * Ose 14 Nov 2026).
 *
 * Until then the ask lived only inside the day-7 Art 14 notice, and a
 * recruiter could submit an uploaded candidate before that notice went — with
 * the unanswered-override, before the candidate knew we held their CV at all.
 * Art 14(3)(c): where data is to be disclosed to another recipient, the person
 * is told at the latest when it is first disclosed.
 *
 * TOLD means one of:
 *   - they applied themselves (source 'matched' — the application was theirs);
 *   - their Art 14 notice was sent;
 *   - the put-forward ask was sent (it carries the notice inline when it is
 *     first contact, and then stands in for the day-7 notice).
 * Not told blocks submission outright, with no override. Told-but-silent keeps
 * today's loud, audited override (lib/agency/represent.ts).
 */

import { agencyAdmin, writeAudit, type AgencyClient } from "./db"
import { loadCandidateMail, sendCandidateMail } from "./candidate-mail"

export const ASK_TEMPLATE_VERSION = "put-forward-v1"
const REMINDER_AFTER_MS = 2 * 86_400_000

interface ToldRow {
  id: string
  ref: string
  source: string | null
  represent_asked_at: string | null
}

/** Ids of candidates who have been told, out of those given. */
export async function toldCandidateIds(
  admin: AgencyClient,
  candidateIds: string[]
): Promise<{ told: Set<string>; rows: ToldRow[] }> {
  if (candidateIds.length === 0) return { told: new Set(), rows: [] }
  const [{ data: rows, error }, { data: notices, error: noticeError }] = await Promise.all([
    admin.from("candidates").select("id, ref, source, represent_asked_at").in("id", candidateIds),
    admin.from("candidate_notices").select("candidate_id, status").in("candidate_id", candidateIds),
  ])
  if (error) throw error
  if (noticeError) throw noticeError
  const noticed = new Set(
    (notices ?? []).filter((n) => n.status === "sent").map((n) => n.candidate_id as string)
  )
  const told = new Set<string>()
  for (const r of (rows ?? []) as ToldRow[]) {
    if (r.source === "matched" || noticed.has(r.id) || r.represent_asked_at) told.add(r.id)
  }
  return { told, rows: (rows ?? []) as ToldRow[] }
}

/** Refs of the candidates who have NOT been told, sorted. Submission refuses these. */
export async function untoldRefs(admin: AgencyClient, candidateIds: string[]): Promise<string[]> {
  const { told, rows } = await toldCandidateIds(admin, candidateIds)
  return rows.filter((r) => !told.has(r.id)).map((r) => r.ref).sort()
}

export type AskOutcome = "sent" | "already_answered" | "no_email" | "not_found" | "failed"

/**
 * Send the ask to one candidate. When it is their first contact, the cleared
 * Art 14 notice goes inline and their scheduled day-7 notice is marked sent
 * by this email, so they are not told twice. Stamps represent_asked_at only
 * after the email went: the gate must never believe someone was told when
 * they were not.
 */
export async function askToPutForward(
  admin: AgencyClient,
  candidateId: string,
  actorId: string | null
): Promise<AskOutcome> {
  const { data: candidate } = await admin
    .from("candidates")
    .select("id, agency_id, role_id, ref, source, represent_status, represent_asked_at")
    .eq("id", candidateId)
    .maybeSingle()
  if (!candidate) return "not_found"
  if (candidate.represent_status !== "unanswered") return "already_answered"

  const ctx = await loadCandidateMail(admin, candidateId)
  if (!ctx?.email) return "no_email"

  const { data: notice } = await admin
    .from("candidate_notices")
    .select("id, status")
    .eq("candidate_id", candidateId)
    .maybeSingle()
  const firstContact = candidate.source !== "matched" && notice?.status !== "sent"

  const sent = await sendCandidateMail(admin, ctx, { kind: "represent_ask", withNotice: firstContact })
  if (!sent) return "failed"

  const now = new Date().toISOString()
  const { error } = await admin
    .from("candidates")
    .update({ represent_asked_at: candidate.represent_asked_at ?? now })
    .eq("id", candidateId)
  if (error) throw error

  // The inline notice IS the notice. A scheduled one is closed as sent by this
  // email; a suppressed one is left alone (its reason still stands).
  if (firstContact && notice && notice.status === "scheduled") {
    await admin
      .from("candidate_notices")
      .update({ status: "sent", sent_at: now, template_version: ASK_TEMPLATE_VERSION })
      .eq("id", notice.id as string)
  }

  await writeAudit(admin, {
    agencyId: candidate.agency_id as string,
    roleId: candidate.role_id as string,
    candidateId,
    actorId,
    entityType: "candidate",
    entityRef: (candidate.ref as string) ?? "",
    action: candidate.represent_asked_at ? "represent_reasked" : "represent_asked",
    toValue: { with_notice: firstContact, template_version: ASK_TEMPLATE_VERSION },
  })
  return "sent"
}

/**
 * At shortlist: ask everyone just shortlisted who has not been asked, when the
 * agency has ask_at_shortlist on (the default). Best effort and never throws —
 * the shortlist decision has already been made and must stand.
 */
/**
 * Run askAtShortlist after the response. Outside a request (tests, scripts)
 * next/server's after() throws, so it falls back to running in the background.
 */
export function scheduleAskAtShortlist(
  schedule: (task: () => Promise<unknown>) => void,
  agencyId: string,
  candidateIds: string[],
  actorId: string
): void {
  const task = () => askAtShortlist(agencyId, candidateIds, actorId)
  try {
    schedule(task)
  } catch {
    void task()
  }
}

export async function askAtShortlist(
  agencyId: string,
  candidateIds: string[],
  actorId: string
): Promise<number> {
  if (candidateIds.length === 0) return 0
  try {
    const admin = agencyAdmin()
    const { data: agency } = await admin
      .from("agencies")
      .select("ask_at_shortlist")
      .eq("id", agencyId)
      .maybeSingle()
    if (agency?.ask_at_shortlist === false) return 0
    const { data: rows } = await admin
      .from("candidates")
      .select("id")
      .eq("agency_id", agencyId)
      .in("id", candidateIds)
      .is("represent_asked_at", null)
    // Who has already answered is checked per person inside askToPutForward
    // (the answer is never a list filter — agency-represent.test.ts).
    let sent = 0
    for (const r of rows ?? []) {
      try {
        if ((await askToPutForward(admin, r.id as string, actorId)) === "sent") sent++
      } catch (e) {
        console.error("[put-forward] ask failed", { name: e instanceof Error ? e.name : typeof e })
      }
    }
    return sent
  } catch (e) {
    console.error("[put-forward] askAtShortlist failed", { name: e instanceof Error ? e.name : typeof e })
    return 0
  }
}

/**
 * The one reminder, two days after the ask, for anyone still silent on a role
 * that is not closed. Stamped before sending so a re-run cannot send twice.
 */
export async function runRepresentReminders(): Promise<number> {
  const admin = agencyAdmin()
  const now = new Date()
  const cutoff = new Date(now.getTime() - REMINDER_AFTER_MS).toISOString()
  const { data: rows, error } = await admin
    .from("candidates")
    .select("id, role_id, erasure_requested_at, represent_status")
    .not("represent_asked_at", "is", null)
    .lte("represent_asked_at", cutoff)
    .is("represent_reminded_at", null)
    .limit(100)
  if (error) throw error

  const roleIds = [...new Set((rows ?? []).map((r) => r.role_id as string))]
  const { data: roles } = roleIds.length
    ? await admin.from("job_roles").select("id, status").in("id", roleIds)
    : { data: [] as Array<{ id: string; status: string }> }
  const closed = new Set((roles ?? []).filter((r) => r.status === "closed").map((r) => r.id as string))

  let sent = 0
  for (const r of rows ?? []) {
    // Answered people are skipped here, per person, not filtered in the query:
    // the answer is never a list filter (agency-represent.test.ts).
    if (r.represent_status !== "unanswered") continue
    if (r.erasure_requested_at || closed.has(r.role_id as string)) continue
    try {
      const { data: claimed } = await admin
        .from("candidates")
        .update({ represent_reminded_at: now.toISOString() })
        .eq("id", r.id as string)
        .is("represent_reminded_at", null)
        .select("id")
      if (!claimed || claimed.length === 0) continue
      const ctx = await loadCandidateMail(admin, r.id as string)
      if (!ctx?.email) continue
      if (await sendCandidateMail(admin, ctx, { kind: "represent_reminder" })) sent++
    } catch (e) {
      console.error("[put-forward] reminder failed", { name: e instanceof Error ? e.name : typeof e })
    }
  }
  return sent
}

/** The receipt after the candidate answers on their rights page. Never throws. */
export function scheduleRepresentReceipt(
  schedule: (task: () => Promise<unknown>) => void,
  candidateId: string,
  answer: "agreed" | "declined" | "withdrawn"
): void {
  const task = () => sendRepresentReceipt(candidateId, answer)
  try {
    schedule(task)
  } catch {
    void task()
  }
}

export async function sendRepresentReceipt(
  candidateId: string,
  answer: "agreed" | "declined" | "withdrawn"
): Promise<void> {
  try {
    const admin = agencyAdmin()
    const ctx = await loadCandidateMail(admin, candidateId)
    if (ctx) await sendCandidateMail(admin, ctx, { kind: "represent_receipt", answer })
  } catch (e) {
    console.error("[put-forward] receipt failed", { name: e instanceof Error ? e.name : typeof e })
  }
}

export type PutForwardState = "not_told" | "told" | "waiting" | "agreed" | "declined" | "withdrawn"

export interface PutForwardRow {
  candidateId: string
  ref: string
  name: string
  state: PutForwardState
  askedAt: string | null
  remindedAt: string | null
  answeredAt: string | null
  hasEmail: boolean
}

/**
 * Where every shortlisted candidate on a role stands before submission
 * (frame 47 §E cards 8–10). Order follows the shortlist; nobody is filtered
 * out or ranked by their answer — this only labels each person.
 */
export async function putForwardRows(
  admin: AgencyClient,
  agencyId: string,
  roleId: string
): Promise<PutForwardRow[]> {
  const { data: reviews, error } = await admin
    .from("recruiter_reviews")
    .select("candidate_id, decision")
    .eq("agency_id", agencyId)
    .eq("role_id", roleId)
    .eq("decision", "shortlist")
  if (error) throw error
  const ids = (reviews ?? []).map((r) => r.candidate_id as string)
  if (ids.length === 0) return []
  const { told } = await toldCandidateIds(admin, ids)
  const { data: cands, error: candError } = await admin
    .from("candidates")
    .select("id, ref, full_name, email, represent_status, represent_answered_at, represent_asked_at, represent_reminded_at")
    .eq("agency_id", agencyId)
    .in("id", ids)
  if (candError) throw candError
  return ((cands ?? []) as Array<Record<string, unknown>>)
    .map((c) => {
      const answer = c.represent_status as string
      let state: PutForwardState
      if (answer === "agreed" || answer === "declined" || answer === "withdrawn") state = answer
      else if (!told.has(c.id as string)) state = "not_told"
      else state = c.represent_asked_at ? "waiting" : "told"
      return {
        candidateId: c.id as string,
        ref: c.ref as string,
        name: (c.full_name as string) ?? "",
        state,
        askedAt: (c.represent_asked_at as string | null) ?? null,
        remindedAt: (c.represent_reminded_at as string | null) ?? null,
        answeredAt: (c.represent_answered_at as string | null) ?? null,
        hasEmail: Boolean(c.email),
      }
    })
    .sort((a, b) => (a.ref < b.ref ? -1 : 1))
}
