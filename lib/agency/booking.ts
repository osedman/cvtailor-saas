/**
 * The candidate's side of an interview booking.
 *
 * The recruiter still picks the time — booking takes the slot off the client's
 * diary, and offering the candidate a menu would hold three of the client's
 * windows hostage while somebody thinks about it. What the candidate gets is
 * the right to confirm it, decline it, and put it in their calendar.
 *
 * One token, one round, no account: a candidate should not have to make a
 * login to answer a question about their own week. The token is stored as a
 * SHA-256 hash beside consent's, so a leaked backup is not a set of live links
 * into people's interviews.
 *
 * DECLINING IS NOT WITHDRAWING. It cancels this meeting and gives the slot
 * back to the client's board — the mirror of the promise the recruiter screen
 * already makes — and it says nothing about the role. `candidate_response` is
 * kept separate from `status` precisely so the trail can tell "they said no to
 * Thursday" from "we called it off", and no query may read a decline as
 * leaving the process.
 */

import { createHash, randomBytes } from "crypto"
import { sendEmail } from "@/lib/email"
import { getAppOrigin } from "@/lib/site-url"
import { buildIcs } from "@/lib/ics"
import { agencyAdmin, writeAudit, type AgencyClient } from "./db"
import { notify } from "./notify"

export type BookingState = "invited" | "confirmed" | "declined" | "cancelled" | "unknown"

export interface BookingView {
  state: BookingState
  /** Named deliberately: you cannot ask somebody to give up a morning without
   * telling them who they are meeting. The data-protection notice withholds
   * the client company; this does not, and that is a considered exception. */
  company: string
  agencyName: string
  roundNumber: number
  scheduledAt: string | null
  durationMinutes: number
  /** Present only once confirmed. A live meeting URL sitting in an
   * unconfirmed inbox is a call somebody can walk into unannounced. */
  meetingUrl: string | null
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

/** Mint a booking link for a round. Returns the raw token exactly once. */
export async function mintBookingToken(admin: AgencyClient, roundId: string): Promise<string> {
  const raw = randomBytes(24).toString("base64url")
  const { error } = await admin
    .from("interview_rounds")
    .update({ booking_token_hash: hashToken(raw) })
    .eq("id", roundId)
  if (error) throw error
  return raw
}

export function bookingUrl(rawToken: string): string {
  // The candidate's own doorway, on the consumer origin like /consent and
  // /rights — somebody answering a question about their week should not land
  // on a domain branded for the agency asking it.
  return `${getAppOrigin()}/booking/${rawToken}`
}

async function loadByToken(admin: AgencyClient, rawToken: string) {
  const { data } = await admin
    .from("interview_rounds")
    .select(
      "id, agency_id, role_id, candidate_id, contact_id, round_number, slot_id, scheduled_at, duration_minutes, meeting_url, status, candidate_response"
    )
    .eq("booking_token_hash", hashToken(rawToken))
    .maybeSingle()
  return data
}

/** What the doorway renders. Reveals nothing a candidate is not entitled to. */
export async function peekBooking(rawToken: string): Promise<BookingView> {
  const admin = agencyAdmin()
  const round = await loadByToken(admin, rawToken)
  if (!round) {
    return { state: "unknown", company: "", agencyName: "", roundNumber: 0, scheduledAt: null, durationMinutes: 0, meetingUrl: null }
  }

  const [{ data: agency }, { data: contact }] = await Promise.all([
    admin.from("agencies").select("name, notice_from_name").eq("id", round.agency_id as string).maybeSingle(),
    admin.from("client_contacts").select("company").eq("id", round.contact_id as string).maybeSingle(),
  ])

  const confirmed = round.candidate_response === "confirmed"
  const state: BookingState =
    round.status === "cancelled"
      ? round.candidate_response === "declined" ? "declined" : "cancelled"
      : confirmed
        ? "confirmed"
        : "invited"

  return {
    state,
    company: (contact?.company as string) ?? "",
    agencyName: (agency?.notice_from_name as string) || (agency?.name as string) || "your recruiter",
    roundNumber: (round.round_number as number) ?? 1,
    scheduledAt: (round.scheduled_at as string) ?? null,
    durationMinutes: (round.duration_minutes as number) ?? 45,
    // Withheld until confirmed, on purpose.
    meetingUrl: confirmed ? ((round.meeting_url as string) || null) : null,
  }
}

export type BookingOutcome = "confirmed" | "declined" | "already_answered" | "not_found" | "gone"

/**
 * The candidate answers. Idempotent for a repeat of the same answer, because
 * people click twice and a second tap should not read as a change of mind.
 */
export async function respondToBooking(
  rawToken: string,
  answer: "confirmed" | "declined"
): Promise<BookingOutcome> {
  const admin = agencyAdmin()
  const round = await loadByToken(admin, rawToken)
  if (!round) return "not_found"

  if (round.candidate_response === answer) return answer
  if (round.status === "cancelled") return "gone"
  if (round.candidate_response !== "pending") return "already_answered"

  const nowIso = new Date().toISOString()

  // Declining cancels THIS MEETING and releases the slot. slot_id must be
  // cleared in the same write: the unique index that prevents double-booking
  // is (slot_id) WHERE slot_id IS NOT NULL and is status-agnostic, so a
  // cancelled round keeping its slot_id would hold that window forever —
  // exactly the bug setRoundStatus() documents.
  const patch: Record<string, unknown> =
    answer === "declined"
      ? { candidate_response: "declined", candidate_responded_at: nowIso, status: "cancelled", slot_id: null, booking_token_hash: null }
      : { candidate_response: "confirmed", candidate_responded_at: nowIso }

  const { error } = await admin
    .from("interview_rounds")
    .update(patch)
    .eq("id", round.id as string)
    .eq("candidate_response", "pending")
  if (error) throw error

  const { data: candidate } = await admin
    .from("candidates")
    .select("ref")
    .eq("id", round.candidate_id as string)
    .maybeSingle()
  const ref = (candidate?.ref as string) ?? ""

  await writeAudit(admin, {
    agencyId: round.agency_id as string,
    roleId: round.role_id as string,
    candidateId: round.candidate_id as string,
    // The candidate is not an auth user; the action names who acted.
    actorId: null,
    entityType: "round",
    entityRef: ref,
    action: `booking_${answer}`,
    reason: "candidate decision",
    toValue: { round_id: round.id, round_number: round.round_number, slot_released: answer === "declined" },
  })

  // Tell the recruiter, or we have rebuilt the polling problem notifications
  // exist to solve. Agency-bound only — nothing here reaches the client.
  await notify(admin, {
    kind: "booking_answered",
    agencyId: round.agency_id as string,
    actorId: null,
    roleId: round.role_id as string,
    candidateRef: ref,
  })

  return answer
}

/**
 * The invitation itself: agency-branded, on the notices pattern rather than
 * the internal notification one, because this goes to a person rather than a
 * colleague.
 */
export async function sendBookingInvite(
  admin: AgencyClient,
  roundId: string,
  rawToken: string
): Promise<{ sent: boolean; reason?: string }> {
  const { data: round } = await admin
    .from("interview_rounds")
    .select("id, agency_id, contact_id, candidate_id, round_number, scheduled_at, duration_minutes")
    .eq("id", roundId)
    .maybeSingle()
  if (!round?.scheduled_at) return { sent: false, reason: "no_time" }

  const [{ data: candidate }, { data: agency }, { data: contact }] = await Promise.all([
    admin.from("candidates").select("full_name, email").eq("id", round.candidate_id as string).maybeSingle(),
    admin.from("agencies").select("name, notice_from_name, notice_reply_to").eq("id", round.agency_id as string).maybeSingle(),
    admin.from("client_contacts").select("company").eq("id", round.contact_id as string).maybeSingle(),
  ])
  if (!candidate?.email) return { sent: false, reason: "no_contact_details" }

  const agencyName = (agency?.notice_from_name as string) || (agency?.name as string) || "A recruitment agency"
  const company = (contact?.company as string) ?? ""
  const start = new Date(round.scheduled_at as string)
  const minutes = (round.duration_minutes as number) ?? 45
  const end = new Date(start.getTime() + minutes * 60_000)
  const url = bookingUrl(rawToken)

  const ics = buildIcs({
    uid: `tailr-round-${round.id}@gettailr.com`,
    start,
    end,
    summary: company ? `Interview — ${company}` : "Interview",
    description: `Arranged by ${agencyName}. Confirm or rearrange: ${url}`,
    organiserName: agencyName,
    now: new Date(),
  })

  const result = await sendEmail({
    to: candidate.email as string,
    subject: company ? `Interview with ${company}` : "Your interview",
    html: bookingHtml({
      candidateName: (candidate.full_name as string) ?? "",
      agencyName,
      company,
      start,
      minutes,
      url,
    }),
    from: `${agencyName} via Tailr <notices@gettailr.com>`,
    replyTo: (agency?.notice_reply_to as string) || undefined,
    attachments: [{ filename: "interview.ics", content: ics, contentType: "text/calendar" }],
  })

  return { sent: result.sent, reason: result.error ?? result.skipped }
}

function fmt(d: Date, minutes: number): string {
  const day = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
  const from = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  const to = new Date(d.getTime() + minutes * 60_000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  return `${day}, ${from} – ${to}`
}

export function bookingHtml(o: {
  candidateName: string
  agencyName: string
  company: string
  start: Date
  minutes: number
  url: string
}): string {
  const firstName = o.candidateName.split(" ")[0] || "there"
  const who = o.company ? escapeHtml(o.company) : "the company"
  return `
<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#fffdfa;color:#1e1813;padding:32px 28px;">
  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#dc4f33;font-weight:700;">Your interview</p>
  <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">A time has been held for you, ${escapeHtml(firstName)}.</h1>
  <p style="margin:0 0 16px;line-height:1.6;">${escapeHtml(o.agencyName)} has arranged an interview with ${who}. It is in the diary as:</p>
  <p style="margin:0 0 16px;padding:14px 16px;background:#f2eee2;border-radius:8px;font-size:16px;font-weight:600;">${escapeHtml(fmt(o.start, o.minutes))}</p>
  <p style="margin:0 0 16px;line-height:1.6;">Please say whether that works. If it does not, say so and the time goes back — it costs you nothing and it is not a comment on the role.</p>
  <p style="margin:0 0 16px;"><a href="${o.url}" style="display:inline-block;background:#1e1813;color:#fffdfa;border-radius:8px;padding:11px 18px;font-weight:600;text-decoration:none;">Confirm or rearrange</a></p>
  <p style="margin:0 0 16px;line-height:1.6;font-size:13px;color:#4e463d;">There is a calendar file attached, and the joining link appears on that page once you confirm. No account needed, and you can reply to this email instead if you prefer.</p>
  <p style="margin:24px 0 0;font-size:12px;color:#7a7266;line-height:1.5;">Sent on behalf of ${escapeHtml(o.agencyName)}, who arranged this interview. Tailr processes it on their behalf.</p>
</div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
