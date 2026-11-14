/**
 * The candidate emails that carry a consent question or its answer
 * (frame 47 §B and §E, signed off by Ose 14 Nov 2026; copy cleared by the
 * lawyer the same day — docs/CONSENT-COPY-DRAFT.md).
 *
 * One module so every one of them keeps the same three promises the frame
 * makes, which were each missing from at least one email before:
 *   - it comes from the agency (agencyNoticeFrom) and names the employer;
 *   - replies go to the agency's notice reply-to, not into the void;
 *   - it carries a fresh rights link (mintRightsLinkOrNone).
 *
 * Buttons only ever open a page. Nothing here pre-selects an answer, so a mail
 * client prefetching links cannot answer on the candidate's behalf.
 */

import { sendEmail } from "@/lib/email"
import { EMAIL_SANS } from "@/lib/email-style"
import { agencyNoticeFrom } from "@/lib/email-senders"
import { getAppOrigin } from "@/lib/site-url"
import type { AgencyClient } from "./db"
import { mintRightsLinkOrNone } from "./rights-link"

export interface CandidateMailContext {
  candidateId: string
  agencyId: string
  roleId: string
  email: string | null
  firstName: string
  agencyName: string
  replyTo: string
  roleTitle: string
  company: string
  retentionDays: number
  source: string
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Everything the emails need about one candidate, in one read. */
export async function loadCandidateMail(
  admin: AgencyClient,
  candidateId: string
): Promise<CandidateMailContext | null> {
  const { data: candidate } = await admin
    .from("candidates")
    .select("id, agency_id, role_id, full_name, email, source")
    .eq("id", candidateId)
    .maybeSingle()
  if (!candidate) return null
  const [{ data: agency }, { data: role }] = await Promise.all([
    admin
      .from("agencies")
      .select("name, notice_from_name, notice_reply_to, retention_days")
      .eq("id", candidate.agency_id as string)
      .maybeSingle(),
    admin
      .from("job_roles")
      .select("title, company")
      .eq("id", candidate.role_id as string)
      .maybeSingle(),
  ])
  const full = ((candidate.full_name as string) ?? "").trim()
  return {
    candidateId: candidate.id as string,
    agencyId: candidate.agency_id as string,
    roleId: candidate.role_id as string,
    email: (candidate.email as string | null) ?? null,
    firstName: full.split(/\s+/)[0] ?? "",
    agencyName:
      (agency?.notice_from_name as string) || (agency?.name as string) || "Your recruiter",
    replyTo: (agency?.notice_reply_to as string) || "",
    roleTitle: (role?.title as string) || "the role",
    company: (role?.company as string) || "the employer",
    retentionDays: (agency?.retention_days as number) ?? 180,
    source: (candidate.source as string) ?? "",
  }
}

const P = "margin:0 0 16px;line-height:1.6;"

function button(href: string, label: string, primary: boolean): string {
  return primary
    ? `<a href="${href}" style="display:inline-block;background:#dc4f33;color:#ffffff;border-radius:8px;padding:12px 20px;font-weight:600;text-decoration:none;margin:0 8px 8px 0;">${escapeHtml(label)}</a>`
    : `<a href="${href}" style="display:inline-block;background:#fffdfa;color:#1e1813;border:1px solid #ded4c1;border-radius:8px;padding:12px 20px;font-weight:600;text-decoration:none;margin:0 8px 8px 0;">${escapeHtml(label)}</a>`
}

function shell(ctx: CandidateMailContext, body: string, rightsUrl: string | null): string {
  const reply = ctx.replyTo
    ? `Replies go to ${escapeHtml(ctx.agencyName)}.`
    : `You can reply to this email to reach ${escapeHtml(ctx.agencyName)}.`
  const rights = rightsUrl
    ? ` Your data and your rights: <a href="${rightsUrl}" style="color:#7a7266;">see what they hold</a>.`
    : ""
  return `
<div style="max-width:560px;margin:0 auto;font-family:${EMAIL_SANS};background:#fffdfa;color:#1e1813;padding:32px 28px;">
  ${body}
  <p style="margin:24px 0 0;font-size:12px;color:#7a7266;line-height:1.5;">${reply}${rights} Sent on behalf of ${escapeHtml(ctx.agencyName)}, who is responsible for your data. Tailr processes it on their behalf.</p>
</div>`
}

function hello(ctx: CandidateMailContext): string {
  return `<p style="${P}">Hi${ctx.firstName ? ` ${escapeHtml(ctx.firstName)}` : ""},</p>`
}

/**
 * The Art 14 notice, as cleared on 14 Nov 2026 (CONSENT-COPY-DRAFT.md §8).
 * Used in the day-7 notice and inline in the put-forward ask when that ask is
 * the candidate's first contact.
 */
export function art14NoticeHtml(opts: {
  agencyName: string
  replyTo: string
  source: string
  retentionDays: number
}): string {
  const from =
    opts.source === "matched"
      ? "you, when you applied"
      : "a CV shared with us for this search"
  const contact = opts.replyTo ? ` Contact: ${escapeHtml(opts.replyTo)}.` : ""
  const s = "margin:0 0 10px;line-height:1.6;font-size:13px;color:#4e463d;"
  return `<div style="margin:0 0 16px;padding:14px 16px;background:#f9f6f0;border-radius:10px;">
  <p style="${s}">We received your CV from ${from}. ${escapeHtml(opts.agencyName)} is responsible for your data.${contact}</p>
  <p style="${s}">We use your CV (work history, skills, education and contact details) to assess you for this role and others like it, on the basis of our legitimate interest in finding candidates for our clients.</p>
  <p style="${s}">Tailr hosts it for us. Its AI provider, Anthropic, reads the CV to match it against the role, and processes data in the United States under the UK International Data Transfer Addendum. We share it with the hiring company only if you agree.</p>
  <p style="margin:0;line-height:1.6;font-size:13px;color:#4e463d;">We keep it for ${opts.retentionDays} days after the role closes, then delete it. You can see, correct or delete it, or object to us using it, from the link in this email. You can also complain to the ICO at ico.org.uk.</p>
</div>`
}

export type CandidateMail =
  | { kind: "recording_request"; when: string; consentUrl: string }
  | { kind: "recording_receipt"; answer: "granted" | "declined"; when: string; consentUrl: string }
  | { kind: "recording_reminder"; when: string; consentUrl: string }
  | { kind: "recording_deleted"; roundDate: string }
  | { kind: "represent_ask"; withNotice: boolean }
  | { kind: "represent_reminder" }
  | { kind: "represent_receipt"; answer: "agreed" | "declined" | "withdrawn" }

/** Subject and body for one email. Pure, so the copy is testable. */
export function renderCandidateMail(
  ctx: CandidateMailContext,
  mail: CandidateMail,
  rightsUrl: string | null
): { subject: string; html: string } {
  const co = escapeHtml(ctx.company)
  const role = escapeHtml(ctx.roleTitle)
  const ag = escapeHtml(ctx.agencyName)
  switch (mail.kind) {
    case "recording_request": {
      const body = `${hello(ctx)}
  <p style="${P}">Your interview with ${co} for ${role} is on ${escapeHtml(mail.when)}. We'd like to record the audio so the write-up uses your own words rather than our notes. Either answer is completely fine.</p>
  <p style="${P}">Saying no changes nothing about how you are assessed: we write the round up instead, and the people interviewing you are not told what you chose. No software scores how you sound or look.</p>
  <p style="${P}">You can change your mind at any time, including after the interview, and the recording is deleted.</p>
  <p style="margin:0 0 16px;">${button(`${mail.consentUrl}?a=yes`, "Yes, you may record", true)}${button(`${mail.consentUrl}?a=no`, "No, please don't", false)}</p>`
      return { subject: `May we record your interview with ${ctx.company}?`, html: shell(ctx, body, rightsUrl) }
    }
    case "recording_receipt": {
      const body =
        mail.answer === "granted"
          ? `${hello(ctx)}
  <p style="${P}">Thanks. We'll record the audio of your interview with ${co} on ${escapeHtml(mail.when)}.</p>
  <p style="${P}">After the call it is transcribed, a recruiter checks which voice is yours, and the audio is deleted that night. Only quotes from your answers are kept, with the rest of your application.</p>
  <p style="${P}">Changed your mind? Use the link below, before or after the interview.</p>
  <p style="margin:0 0 16px;">${button(mail.consentUrl, "Stop recording", false)}</p>`
          : `${hello(ctx)}
  <p style="${P}">Noted. Your interview with ${co} on ${escapeHtml(mail.when)} won't be recorded. Nothing else changes.</p>
  <p style="margin:0 0 16px;">${button(mail.consentUrl, "Change my answer", false)}</p>`
      return {
        subject:
          mail.answer === "granted"
            ? "You agreed to recording: here is what happens"
            : `Your interview with ${ctx.company} won't be recorded`,
        html: shell(ctx, body, rightsUrl),
      }
    }
    case "recording_reminder": {
      const body = `${hello(ctx)}
  <p style="${P}">Your interview with ${co} is on ${escapeHtml(mail.when)}. You haven't told us whether we may record it, and that's fine.</p>
  <p style="${P}">If we don't hear from you, we won't record.</p>
  <p style="margin:0 0 16px;">${button(`${mail.consentUrl}?a=yes`, "Yes, you may record", true)}${button(`${mail.consentUrl}?a=no`, "No, please don't", false)}</p>`
      return { subject: "Reminder: may we record your interview?", html: shell(ctx, body, rightsUrl) }
    }
    case "recording_deleted": {
      const body = `${hello(ctx)}
  <p style="${P}">As you asked, we've deleted the recording, transcript and quotes from your interview with ${co}${mail.roundDate ? ` on ${escapeHtml(mail.roundDate)}` : ""}.</p>
  <p style="${P}">Your application continues. That round is now assessed from the interviewer's written notes.</p>`
      return { subject: "Your interview recording has been deleted", html: shell(ctx, body, rightsUrl) }
    }
    case "represent_ask": {
      const answer = rightsUrl ?? ""
      const body = `${hello(ctx)}
  <p style="${P}">We think you're a strong fit for ${role} at ${co} and would like to send them your CV and our notes.</p>
  <p style="${P}">Nothing goes to them until you say yes. Saying no only means we won't send you to this employer.</p>
  ${answer ? `<p style="margin:0 0 16px;">${button(answer, "Yes, put me forward", true)}${button(answer, "No, not this one", false)}</p>` : `<p style="${P}">Reply to this email with yes or no.</p>`}
  ${mail.withNotice ? art14NoticeHtml({ agencyName: ctx.agencyName, replyTo: ctx.replyTo, source: ctx.source, retentionDays: ctx.retentionDays }) : ""}`
      return { subject: `May we put you forward to ${ctx.company}?`, html: shell(ctx, body, rightsUrl) }
    }
    case "represent_reminder": {
      const answer = rightsUrl ?? ""
      const body = `${hello(ctx)}
  <p style="${P}">A quick reminder: we'd like to put you forward for ${role} at ${co}.</p>
  <p style="${P}">If you'd rather we didn't, just say so. It won't affect any other role.</p>
  ${answer ? `<p style="margin:0 0 16px;">${button(answer, "Yes, put me forward", true)}${button(answer, "No, not this one", false)}</p>` : ""}`
      return { subject: `Still keen on ${ctx.company}?`, html: shell(ctx, body, rightsUrl) }
    }
    case "represent_receipt": {
      const change = rightsUrl ? `<p style="margin:0 0 16px;">${button(rightsUrl, "I've changed my mind", false)}</p>` : ""
      if (mail.answer === "agreed") {
        const body = `${hello(ctx)}
  <p style="${P}">Thanks. We'll send ${co} your CV and our notes for ${role}, and let you know what they say.</p>
  <p style="${P}">Changed your mind? Use the link below. Anything already sent stays with them, but we won't send more.</p>
  ${change}`
        return { subject: `Thanks, we'll put you forward to ${ctx.company}`, html: shell(ctx, body, rightsUrl) }
      }
      if (mail.answer === "declined") {
        const body = `${hello(ctx)}
  <p style="${P}">Noted, we won't put you forward to ${co}. It doesn't affect any other role.</p>
  ${change}`
        return { subject: `We won't put you forward to ${ctx.company}`, html: shell(ctx, body, rightsUrl) }
      }
      const body = `${hello(ctx)}
  <p style="${P}">Noted, we won't send anything more about you to ${co}. Anything we had already sent stays with them; ask ${ag} if you'd like them to request its deletion.</p>`
      return { subject: `We'll stop putting you forward to ${ctx.company}`, html: shell(ctx, body, rightsUrl) }
    }
  }
}

/**
 * Render and send. A fresh rights link per email (raw-once, like every
 * doorway). Never throws: the caller's act (an answer, a deletion) has already
 * happened and must not be undone by a mail failure. Returns whether it sent.
 */
export async function sendCandidateMail(
  admin: AgencyClient,
  ctx: CandidateMailContext,
  mail: CandidateMail
): Promise<boolean> {
  if (!ctx.email) return false
  try {
    const token = await mintRightsLinkOrNone(admin, { id: ctx.candidateId, agencyId: ctx.agencyId })
    const rightsUrl = token ? `${getAppOrigin()}/rights/${token}` : null
    const { subject, html } = renderCandidateMail(ctx, mail, rightsUrl)
    const result = await sendEmail({
      to: ctx.email,
      subject,
      html,
      from: agencyNoticeFrom(ctx.agencyName),
      replyTo: ctx.replyTo || undefined,
    })
    return result.sent
  } catch (error) {
    console.error("[candidate-mail] send failed", {
      kind: mail.kind,
      name: error instanceof Error ? error.name : typeof error,
    })
    return false
  }
}

/** "Tuesday 18 November, 10:00" in UK time, or "shortly" when unknown. */
export function whenLine(iso: string | null | undefined): string {
  if (!iso) return "shortly"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "shortly"
  return d.toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  })
}
