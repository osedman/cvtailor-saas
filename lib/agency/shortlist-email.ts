/**
 * The "your shortlist is in your workspace" email (Figma board 34, approved
 * 29 Sep 2026).
 *
 * It is a pointer, not the shortlist. Names and one line each, then a button
 * back to the workspace — the evidence, the CV and every decision live there,
 * behind a sign-in, where the disclosure switches are applied and opening a
 * CV is recorded. Putting the whole shortlist in an inbox would put it
 * somewhere Tailr can no longer withdraw it from.
 *
 * Two variants, one template: a contact who already has a workspace gets
 * "Open the shortlist"; one who does not gets an invitation link in the same
 * email, because without it they have no way in at all.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export interface ShortlistEmailPerson {
  /** Already disclosure-shaped by the caller: a withheld name arrives as the ref. */
  name: string
  title: string
}

export function shortlistEmailSubject(opts: { roleTitle: string; count: number }): string {
  return `Shortlist: ${opts.roleTitle} (${opts.count} candidate${opts.count === 1 ? "" : "s"})`
}

export function shortlistEmailHtml(opts: {
  agencyName: string
  company: string
  roleTitle: string
  intro: string
  people: ShortlistEmailPerson[]
  url: string
  /** True when the link is an invitation (the contact has no workspace yet). */
  invite: boolean
  inviteExpiresAt?: string
}): string {
  const agency = escapeHtml(opts.agencyName || "Your recruitment partner")
  const role = escapeHtml(opts.roleTitle)
  const company = escapeHtml(opts.company)
  const intro = opts.intro.trim()
  const rows = opts.people
    .map(
      (p, i) =>
        `<tr><td style="padding:12px 0;border-top:1px solid #eee6da;"><p style="margin:0;font-size:15px;font-weight:700;color:#1e1813;">${i + 1}. ${escapeHtml(p.name)}</p>${
          p.title ? `<p style="margin:2px 0 0;font-size:14px;line-height:1.5;color:#595959;">${escapeHtml(p.title)}</p>` : ""
        }</td></tr>`
    )
    .join("")
  const expiry = opts.inviteExpiresAt
    ? new Date(opts.inviteExpiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : ""
  const cta = opts.invite ? "Accept and open the shortlist" : "Open the shortlist"

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9f6f0;font-family:'Noto Sans',-apple-system,Segoe UI,Arial,sans-serif;color:#1e1813;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
<div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#1e1813;">tailr<span style="color:#dc4f33;">.</span></div>
<h1 style="font-size:26px;line-height:1.25;font-weight:800;letter-spacing:-0.5px;margin:24px 0 10px;">${agency} has sent you ${opts.people.length === 1 ? "a candidate" : `${opts.people.length} candidates`} for ${role}</h1>
<p style="font-size:16px;line-height:1.6;color:#595959;margin:0 0 18px;">The shortlist${company ? ` for ${company}` : ""} is waiting in your hiring workspace, with the evidence behind every recommendation. That is where you choose who to meet and offer the times you can do.</p>
${intro ? `<blockquote style="margin:0 0 20px;padding:14px 16px;background:#fdfcf9;border-left:3px solid #dc4f33;border-radius:6px;font-size:15px;line-height:1.6;color:#3b3b3b;">${escapeHtml(intro).replace(/\n/g, "<br />")}</blockquote>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-bottom:1px solid #eee6da;">${rows}</table>
<div style="text-align:center;margin:28px 0 16px;"><a href="${opts.url}" style="display:inline-block;background:#dc4f33;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 28px;border-radius:10px;">${cta}</a></div>
${
  opts.invite
    ? `<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 6px;">This is your first shortlist from ${agency} on Tailr, so the button also sets up your workspace. Please sign in with this email address: the invitation is tied to it.${expiry ? ` The link works once and expires on ${expiry}.` : ""}</p>`
    : `<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 6px;">You will be asked to sign in if you are not already.</p>`
}
<p style="font-size:13px;line-height:1.6;color:#8a8178;margin:16px 0 22px;word-break:break-all;">If the button does not work, paste this into your browser:<br /><a href="${opts.url}" style="color:#b3341b;">${opts.url}</a></p>
<p style="font-size:15px;color:#1e1813;margin:0;">&mdash; ${agency}, via Tailr</p>
<p style="font-size:12px;color:#a8a29e;margin:28px 0 0;line-height:1.5;">This shortlist is confidential and was sent to you by name. Reply to this email to reach ${agency} directly.</p>
</div></body></html>`
}
