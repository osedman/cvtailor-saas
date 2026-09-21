/**
 * Reminders that run on a schedule rather than on somebody's click.
 *
 * Two kinds, and they are different enough to keep apart:
 *
 * - a **nudge**, to somebody who was invited and has not chosen a time;
 * - a **pre-interview reminder**, to somebody who did choose and is due
 *   tomorrow.
 *
 * Each is stamped on the round when it goes, so a job that runs every hour
 * cannot mail the same person every hour. That stamp is the whole safety
 * mechanism: without it this is a machine for annoying candidates.
 *
 * The nudge deliberately mints a fresh booking link, because the stored
 * token is a hash and cannot be recovered — the same trade the board's
 * "send again" button makes, and the email says so.
 */

import { agencyAdmin, writeAudit, type AgencyClient } from "./db"
import { mintBookingToken, sendSelfBookingInvite } from "./booking"
import { sendEmail } from "@/lib/email"
import { CHASE_AFTER_HOURS } from "./cohort-status"

/** How long after the last contact a nudge may go again. */
export const NUDGE_EVERY_HOURS = 72
/** How far ahead of an interview the reminder goes. */
export const PRE_REMINDER_HOURS = 24

export interface ReminderRun {
  nudged: number
  reminded: number
  skipped: number
}

interface RoundRow {
  id: string
  agency_id: string
  role_id: string
  candidate_id: string
  contact_id: string
  slot_id: string | null
  scheduled_at: string | null
  duration_minutes: number
  meeting_url: string
  status: string
  candidate_response: string
  created_at: string
  last_reminded_at: string | null
  pre_reminded_at: string | null
}

const hoursSince = (iso: string | null, now: Date): number =>
  iso && Number.isFinite(Date.parse(iso)) ? (now.getTime() - Date.parse(iso)) / 3_600_000 : Infinity

/** Somebody invited, still choosing, and quiet for long enough to nudge. */
export function dueForNudge(r: RoundRow, now: Date): boolean {
  if (r.status !== "scheduled" || r.slot_id || r.candidate_response !== "pending") return false
  // Quiet since the LAST contact, whichever that was — the invitation or an
  // earlier nudge. Otherwise the first nudge lands the moment they are
  // invited plus the threshold, regardless of how recently we wrote.
  const lastContact = r.last_reminded_at ?? r.created_at
  return hoursSince(r.created_at, now) >= CHASE_AFTER_HOURS && hoursSince(lastContact, now) >= NUDGE_EVERY_HOURS
}

/** Somebody booked, due within the window, not yet reminded. */
export function dueForPreReminder(r: RoundRow, now: Date): boolean {
  if (r.status !== "scheduled" || !r.scheduled_at || r.candidate_response !== "confirmed") return false
  if (r.pre_reminded_at) return false
  const hoursAway = (Date.parse(r.scheduled_at) - now.getTime()) / 3_600_000
  return hoursAway > 0 && hoursAway <= PRE_REMINDER_HOURS
}

/**
 * Send what is due, across every agency.
 *
 * Failures are counted, never thrown: one candidate with an address we
 * cannot write to must not stop everybody else's reminder. The email guard
 * refusing a non-production address counts as skipped, which is it working.
 */
export async function runInterviewReminders(now: Date = new Date()): Promise<ReminderRun> {
  const admin = agencyAdmin()
  const run: ReminderRun = { nudged: 0, reminded: 0, skipped: 0 }

  // Only rounds that could possibly be due: scheduled, and either unbooked
  // or booked within the reminder window.
  const { data, error } = await admin
    .from("interview_rounds")
    .select(
      "id, agency_id, role_id, candidate_id, contact_id, slot_id, scheduled_at, duration_minutes, meeting_url, status, candidate_response, created_at, last_reminded_at, pre_reminded_at"
    )
    .eq("status", "scheduled")
    .limit(500)
  if (error) throw error

  for (const row of (data ?? []) as unknown as RoundRow[]) {
    try {
      if (dueForNudge(row, now)) {
        const token = await mintBookingToken(admin, row.id)
        const sent = await sendSelfBookingInvite(admin, row.id, token)
        await admin.from("interview_rounds").update({ last_reminded_at: now.toISOString() }).eq("id", row.id)
        if (sent.sent) run.nudged += 1
        else run.skipped += 1
        await stamp(admin, row, "booking_nudged", { sent: sent.sent })
        continue
      }
      if (dueForPreReminder(row, now)) {
        const sent = await sendPreReminder(admin, row)
        await admin.from("interview_rounds").update({ pre_reminded_at: now.toISOString() }).eq("id", row.id)
        if (sent) run.reminded += 1
        else run.skipped += 1
        await stamp(admin, row, "booking_pre_reminded", { sent })
      }
    } catch {
      // One bad address must not stop the rest.
      run.skipped += 1
    }
  }
  return run
}

async function stamp(admin: AgencyClient, row: RoundRow, action: string, to: Record<string, unknown>) {
  const { data: candidate } = await admin.from("candidates").select("ref").eq("id", row.candidate_id).maybeSingle()
  await writeAudit(admin, {
    agencyId: row.agency_id,
    roleId: row.role_id,
    candidateId: row.candidate_id,
    actorId: null,
    entityType: "round",
    entityRef: (candidate?.ref as string) ?? "",
    action,
    reason: "scheduled reminder",
    toValue: { round_id: row.id, ...to },
  })
}

async function sendPreReminder(admin: AgencyClient, row: RoundRow): Promise<boolean> {
  const [{ data: candidate }, { data: agency }, { data: contact }] = await Promise.all([
    admin.from("candidates").select("full_name, email").eq("id", row.candidate_id).maybeSingle(),
    admin.from("agencies").select("name, notice_from_name, notice_reply_to").eq("id", row.agency_id).maybeSingle(),
    admin.from("client_contacts").select("company").eq("id", row.contact_id).maybeSingle(),
  ])
  if (!candidate?.email || !row.scheduled_at) return false

  const agencyName = (agency?.notice_from_name as string) || (agency?.name as string) || "your recruiter"
  const company = (contact?.company as string) ?? ""
  const when = new Date(row.scheduled_at)
  // UK time, labelled (see booking.ts fmt). And "tomorrow" only when it IS
  // tomorrow in the UK: the cron runs at 03:30 and reminds anyone due within
  // 24h, so a same-day 14:00 interview was headed "Tomorrow" (21 Sep 2026).
  const tz = "Europe/London"
  const day = when.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz })
  const time = when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz })
  const ukDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz })
  const isToday = ukDate(when) === ukDate(new Date())
  const lead = isToday ? "Today" : "Tomorrow"

  const result = await sendEmail({
    to: candidate.email as string,
    subject: company ? `${lead}: your interview with ${company}` : `Your interview ${lead.toLowerCase()}`,
    html: preReminderHtml({
      candidateName: ((candidate.full_name as string) ?? "").trim().split(/\s+/)[0] || "there",
      agencyName,
      company,
      when: `${day} at ${time} (UK time)`,
      minutes: row.duration_minutes ?? 45,
      meetingUrl: row.meeting_url || "",
    }),
    from: `${agencyName} via Tailr <notices@gettailr.com>`,
    replyTo: (agency?.notice_reply_to as string) || undefined,
  })
  return result.sent
}

export function preReminderHtml(o: {
  candidateName: string
  agencyName: string
  company: string
  when: string
  minutes: number
  meetingUrl: string
}): string {
  const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
  return `<!doctype html><html><body style="margin:0;background:#f9f6f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1e1813">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Hi ${esc(o.candidateName)},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">
      A reminder of your interview${o.company ? ` with ${esc(o.company)}` : ""}:
    </p>
    <p style="font-size:17px;font-weight:600;margin:0 0 16px">${esc(o.when)} · ${o.minutes} minutes</p>
    ${
      o.meetingUrl
        ? `<p style="margin:24px 0"><a href="${esc(o.meetingUrl)}" style="display:inline-block;background:#dc4f33;color:#fdfcf9;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px">Join the call</a></p>`
        : ""
    }
    <p style="font-size:13px;line-height:1.6;color:#6b615a;margin:0">
      If something has changed, reply to ${esc(o.agencyName)} and they will sort it out.
    </p>
  </div>
</body></html>`
}
