/**
 * Cross-wall notifications: the silent return leg of every doorway.
 *
 * Tailr already mails the ASK — consent, reference request, client invite,
 * team invite. What it never mailed was the ANSWER. A hiring manager filed a
 * brief and it sat in the recruiter's inbox until somebody happened to look;
 * briefs sat invisible for days. Everything here exists to close that leg.
 *
 * Three rules hold it together.
 *
 * 1. A notification carries a POINTER, never the payload. No candidate names,
 *    no brief bodies, no write-up text, no consent answers. Email is an
 *    insecure, un-revocable channel that gets forwarded to people who were
 *    never on the thread — and getting the reader INTO the app is the whole
 *    job anyway. This is the audit log's existing rule (counts, not content)
 *    applied to the outbox.
 *
 * 2. The actor is never told about their own action. A recruiter who writes up
 *    a round does not need an email announcing that a round was written up.
 *    That one check is the difference between a signal and a folder rule.
 *
 * 3. Which side of the wall an event faces is declared once, in facesClient(),
 *    so a new event cannot accidentally mail a hiring manager something only
 *    the agency may see. The consent promise depends on this: the panel
 *    interviewing someone is never told what that person chose.
 *
 * Every outcome writes an audit row, and nothing here throws — a notification
 * that fails must never fail the write it is attached to.
 */

import { sendEmail } from "@/lib/email"
import { createAdminClient } from "@/lib/supabase/server"
import { getBusinessOrigin } from "@/lib/site-url"
import { writeAudit, type AgencyClient } from "./db"

export type NotifyOutcome =
  | "sent"
  | "skipped_actor"
  | "skipped_no_recipient"
  | "skipped_disabled"
  | "partial"
  | "failed"

/** The events that cross the wall. Each one is the answer to an ask Tailr
 * already sends, except brief_filed, which had no ask at all. */
export type NotifyEvent =
  | { kind: "brief_filed"; contactId: string; roleTitle: string }
  | { kind: "brief_answered"; contactId: string; roleTitle: string; accepted: boolean }
  | { kind: "invite_accepted"; contactId: string }
  | { kind: "debrief_recorded"; roleId: string; candidateRef: string }
  | { kind: "consent_answered"; roleId: string; candidateRef: string }
  | { kind: "reference_submitted"; roleId: string; candidateRef: string }
  | { kind: "booking_answered"; roleId: string; candidateRef: string }

export type NotifyInput = NotifyEvent & {
  agencyId: string
  /** Whoever caused this. Never notified about their own action. */
  actorId?: string | null
}

type Recipient = { email: string; name: string; userId: string | null }

/**
 * Does this event face the client side of the wall?
 *
 * Deliberately a whitelist of one. Everything else is agency-bound, so adding
 * an event defaults to the safe side: a new kind cannot leak to a hiring
 * manager unless somebody edits this function on purpose.
 */
export function facesClient(kind: NotifyEvent["kind"]): boolean {
  return kind === "brief_answered"
}

/**
 * Whether one person wants one kind of notification.
 *
 * Two layers, resolved in this order and nowhere else: the person's own row
 * wins if they have one; otherwise the agency's default (the row with a null
 * user_id); otherwise ON. Absent means on because an unheard event is the
 * problem this whole file exists to solve — silence is something somebody
 * chooses, never something that happens by omission.
 *
 * Exported so the settings screen resolves it the same way rather than
 * reimplementing the precedence and drifting.
 */
export function resolvePreference(
  rows: Array<{ user_id: string | null; enabled: boolean }>,
  userId: string | null
): boolean {
  if (userId) {
    const mine = rows.find((r) => r.user_id === userId)
    if (mine) return mine.enabled
  }
  const agencyDefault = rows.find((r) => r.user_id === null)
  if (agencyDefault) return agencyDefault.enabled
  return true
}

/**
 * Send one notification. Callers decide only that the event happened; this
 * decides who hears about it, whether they should, and what they are told.
 */
export async function notify(admin: AgencyClient, input: NotifyInput): Promise<NotifyOutcome> {
  try {
    return await notifyInner(admin, input)
  } catch {
    // A broken notification must never break the write it followed. The audit
    // attempt below is best-effort for the same reason.
    try {
      await audit(admin, input, "failed", "notify_threw")
    } catch {
      /* nothing left to do */
    }
    return "failed"
  }
}

async function notifyInner(admin: AgencyClient, input: NotifyInput): Promise<NotifyOutcome> {
  const recipients = facesClient(input.kind)
    ? await clientRecipient(admin, input)
    : await agencyRecipients(admin, input)

  // The actor caused this; they already know.
  const targets = recipients.filter((r) => !r.userId || r.userId !== input.actorId)
  if (recipients.length > 0 && targets.length === 0) {
    await audit(admin, input, "skipped_actor")
    return "skipped_actor"
  }
  if (targets.length === 0) {
    await audit(admin, input, "skipped_no_recipient")
    return "skipped_no_recipient"
  }

  // Preferences are personal, so this is per recipient, not per event. A
  // client-facing notification is never filtered: brief_answered is a message
  // to somebody's client about their own brief, not a preference a recruiter
  // holds, and the table's check constraint refuses to store one.
  let wanted = targets
  if (!facesClient(input.kind)) {
    const { data: prefRows } = await admin
      .from("notification_prefs")
      .select("user_id, enabled")
      .eq("agency_id", input.agencyId)
      .eq("event_kind", input.kind)
    const rows = (prefRows ?? []) as Array<{ user_id: string | null; enabled: boolean }>
    wanted = targets.filter((t) => resolvePreference(rows, t.userId))
    if (wanted.length === 0) {
      await audit(admin, input, "skipped_disabled", undefined, { of: targets.length })
      return "skipped_disabled"
    }
  }

  const { subject, html } = notificationHtml(input)
  let sent = 0
  const failures: string[] = []

  for (const target of wanted) {
    const result = await sendEmail({ to: target.email, subject, html })
    if (result.sent) sent += 1
    else failures.push(result.error ?? result.skipped ?? "unknown")
  }

  const silenced = targets.length - wanted.length
  if (sent === wanted.length) {
    await audit(admin, input, "sent", undefined, { recipients: wanted.length, silenced })
    return "sent"
  }
  if (sent > 0) {
    await audit(admin, input, "partial", failures[0], { sent, of: wanted.length, silenced })
    return "partial"
  }
  await audit(admin, input, "failed", failures[0], { of: wanted.length, silenced })
  return "failed"
}

/**
 * The hiring manager who owns this client contact.
 *
 * One row, one address, and only ever the contact the event is about — a
 * client is never told about another client's brief.
 */
async function clientRecipient(admin: AgencyClient, input: NotifyInput): Promise<Recipient[]> {
  const contactId = "contactId" in input ? input.contactId : ""
  if (!contactId) return []
  const { data } = await admin
    .from("client_contacts")
    .select("email, full_name, agency_id")
    .eq("id", contactId)
    .eq("agency_id", input.agencyId)
    .maybeSingle()
  if (!data?.email) return []
  return [{ email: data.email as string, name: (data.full_name as string) || "there", userId: null }]
}

/**
 * Who on the agency side hears about this.
 *
 * Roles have no owner yet — that is a named gap — so provenance is the best
 * available proxy: whoever created the role, or invited the client contact,
 * is the person with the relationship. When that pointer is null (created_by
 * is set null on account deletion, deliberately) it falls back to the agency's
 * owners, because an unheard event is the bug this file exists to fix.
 */
async function agencyRecipients(admin: AgencyClient, input: NotifyInput): Promise<Recipient[]> {
  let preferred: string | null = null

  if ("roleId" in input && input.roleId) {
    const { data } = await admin
      .from("job_roles")
      .select("created_by")
      .eq("id", input.roleId)
      .eq("agency_id", input.agencyId)
      .maybeSingle()
    preferred = (data?.created_by as string | null) ?? null
  } else if ("contactId" in input && input.contactId) {
    const { data } = await admin
      .from("client_contacts")
      .select("created_by")
      .eq("id", input.contactId)
      .eq("agency_id", input.agencyId)
      .maybeSingle()
    preferred = (data?.created_by as string | null) ?? null
  }

  const { data: members } = await admin
    .from("members")
    .select("user_id, role, status")
    .eq("agency_id", input.agencyId)
    .eq("status", "active")

  const active = members ?? []
  if (active.length === 0) return []

  // Viewers are read-only and are not the person who acts on this.
  const actionable = active.filter((m) => m.role === "owner" || m.role === "recruiter")
  const preferredRow = preferred ? actionable.find((m) => m.user_id === preferred) : undefined
  const chosen = preferredRow ? [preferredRow] : actionable.filter((m) => m.role === "owner")
  if (chosen.length === 0) return []

  const ids = chosen.map((m) => m.user_id as string)
  const publicAdmin = createAdminClient()
  const { data: profiles } = await publicAdmin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids)

  type ProfileRow = { id: string; full_name: string | null; email: string | null }
  return ((profiles ?? []) as ProfileRow[])
    .filter((p): p is ProfileRow & { email: string } => typeof p.email === "string" && !!p.email)
    .map((p) => ({
      email: p.email,
      name: (p.full_name || "").split(" ")[0] || "there",
      userId: p.id,
    }))
}

async function audit(
  admin: AgencyClient,
  input: NotifyInput,
  action: string,
  reason?: string,
  toValue?: Record<string, unknown>
): Promise<void> {
  await writeAudit(admin, {
    agencyId: input.agencyId,
    roleId: "roleId" in input ? input.roleId : undefined,
    actorId: input.actorId ?? undefined,
    entityType: "notification",
    // The event kind, never its content — an entity_ref is read by people who
    // are not entitled to the payload.
    entityRef: input.kind,
    action,
    reason,
    toValue: { ...(toValue ?? {}), faces: facesClient(input.kind) ? "client" : "agency" },
  })
}

type Copy = {
  subject: string
  eyebrow: string
  heading: string
  body: string
  ctaLabel: string
  ctaUrl: string
}

/**
 * What each event says. Pointers only: a role title, a candidate ref, a
 * company name — all of it the agency's own shorthand, none of it the
 * substance of what was said or decided.
 */
/** The rendered notification, exported so it can be previewed and signed off
 * without sending anything — the same reason notices.ts exports noticeHtml. */
export function notificationHtml(input: NotifyInput): { subject: string; html: string } {
  const copy = copyFor(input)
  return {
    subject: copy.subject,
    html: shell({
      eyebrow: copy.eyebrow,
      heading: copy.heading,
      body: copy.body,
      ctaLabel: copy.ctaLabel,
      ctaUrl: copy.ctaUrl,
    }),
  }
}

function copyFor(input: NotifyInput): Copy {
  const agencyOrigin = getBusinessOrigin()

  switch (input.kind) {
    case "brief_filed":
      return {
        subject: `New brief: ${input.roleTitle}`,
        eyebrow: "A brief arrived",
        heading: "A hiring manager filed a brief.",
        body: `They are asking you to hire for ${esc(input.roleTitle)}. It is waiting in your brief inbox, where you can accept it into a role or decline it with a note back to them.`,
        ctaLabel: "Open the brief",
        ctaUrl: `${agencyOrigin}/agencies/briefs`,
      }

    case "brief_answered":
      return {
        subject: input.accepted
          ? `Your brief was accepted: ${input.roleTitle}`
          : `An update on your brief: ${input.roleTitle}`,
        eyebrow: "Your brief",
        heading: input.accepted ? "Your brief was accepted." : "Your recruiter replied to your brief.",
        body: input.accepted
          ? `Your recruiter has taken on ${esc(input.roleTitle)} and started work. You will see candidates here as they are put forward.`
          : `Your recruiter has replied about ${esc(input.roleTitle)}, with a note explaining where things stand. Open it to read their reply.`,
        ctaLabel: "See your briefs",
        ctaUrl: `${agencyOrigin}/hiring`,
      }

    case "invite_accepted":
      return {
        subject: "Your client activated their access",
        eyebrow: "Client access",
        heading: "Your client is in.",
        body: "The hiring manager you invited has signed in for the first time. They can now file briefs, give availability and write up rounds without going through you.",
        ctaLabel: "Open clients",
        ctaUrl: `${agencyOrigin}/agencies/clients`,
      }

    case "debrief_recorded":
      return {
        subject: `Write-up in for ${input.candidateRef}`,
        eyebrow: "A round was written up",
        heading: "A write-up landed.",
        body: `The hiring manager has written up their round with ${esc(input.candidateRef)}. The answers are on the candidate's dossier.`,
        ctaLabel: "Read the write-up",
        ctaUrl: `${agencyOrigin}/agencies/roles/${encodeURIComponent(input.roleId)}`,
      }

    case "consent_answered":
      return {
        subject: `${input.candidateRef} answered the recording ask`,
        eyebrow: "A candidate replied",
        heading: "A candidate answered.",
        body: `${esc(input.candidateRef)} has responded to the ask about recording their interview. Their answer is on the round, and it stays between you and them.`,
        ctaLabel: "Open the round",
        ctaUrl: `${agencyOrigin}/agencies/roles/${encodeURIComponent(input.roleId)}`,
      }

    case "booking_answered":
      return {
        subject: `${input.candidateRef} answered their interview time`,
        eyebrow: "A candidate replied",
        heading: "A candidate answered their invitation.",
        body: `${esc(input.candidateRef)} has responded to the time you booked. If they could not make it the slot has already gone back to the client's board, so nothing is being held.`,
        ctaLabel: "Open the round",
        ctaUrl: `${agencyOrigin}/agencies/roles/${encodeURIComponent(input.roleId)}`,
      }

    case "reference_submitted":
      return {
        subject: `A reference came back for ${input.candidateRef}`,
        eyebrow: "A reference arrived",
        heading: "A reference came back.",
        body: `A referee has completed their reference for ${esc(input.candidateRef)}. It is on the candidate's dossier with the rest of their evidence.`,
        ctaLabel: "Read the reference",
        ctaUrl: `${agencyOrigin}/agencies/roles/${encodeURIComponent(input.roleId)}`,
      }
  }
}

/** One shell for every notification, matching the notice and team templates:
 * inline styles, brand tokens, dash-free prose. */
function shell(o: { eyebrow: string; heading: string; body: string; ctaLabel: string; ctaUrl: string }): string {
  return `
<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#fffdfa;color:#1e1813;padding:32px 28px;">
  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#dc4f33;font-weight:700;">${esc(o.eyebrow)}</p>
  <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">${esc(o.heading)}</h1>
  <p style="margin:0 0 20px;line-height:1.6;">${o.body}</p>
  <p style="margin:0 0 20px;"><a href="${o.ctaUrl}" style="display:inline-block;background:#1e1813;color:#fffdfa;border-radius:8px;padding:10px 16px;font-weight:600;text-decoration:none;">${esc(o.ctaLabel)}</a></p>
  <p style="margin:24px 0 0;font-size:12px;color:#7a7266;line-height:1.5;">Tailr sends this because something you are working on moved. The detail stays in the app rather than in your inbox.</p>
</div>`
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
