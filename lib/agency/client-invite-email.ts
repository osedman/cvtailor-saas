/**
 * The hiring-manager invitation email. Moved out of the invite route
 * (22 Sep 2026) so a resend from a script sends the same email, not a copy.
 */
import { INVITE_TTL_DAYS } from "./client-auth"

/** Agency and company names are recruiter-typed free text going into an email
 * body. Escape them, or an apostrophe breaks the markup and a tag does worse. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * The invitation email.
 *
 * A real person is being handed access to a hiring workspace, so the copy says
 * who invited them, what the workspace is for, that the link expires, that it
 * works once, and which address they have to sign in with (acceptInvite
 * rejects any other, and without this line people reach for a personal inbox
 * and get bounced). Inline styles, brand colours, brand sans, no monospace.
 */
export function inviteEmailHtml(opts: {
  agencyName: string
  company: string
  url: string
  expiresAt: string
}): string {
  const agency = escapeHtml(opts.agencyName || "Your recruitment partner")
  const company = escapeHtml(opts.company)
  const forCompany = company ? ` for ${company}` : ""
  const expiryLabel = new Date(opts.expiresAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9f6f0;font-family:'Hanken Grotesk',-apple-system,Segoe UI,Arial,sans-serif;color:#1e1813;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
<div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#1e1813;">tailr<span style="color:#dc4f33;">.</span></div>
<h1 style="font-size:26px;line-height:1.25;font-weight:800;letter-spacing:-0.5px;margin:24px 0 10px;">${agency} has invited you to their hiring workspace</h1>
<p style="font-size:16px;line-height:1.6;color:#595959;margin:0 0 22px;">They use Tailr to run the hiring they are doing${forCompany}, and they would like you in it with them, so the shortlists, the scheduling and the decisions all live in one place instead of scattered across email attachments. Here is what the workspace is for:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><td style="padding:14px 0;border-top:1px solid #eee6da;"><p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#dc4f33;">Reviewing the shortlists they send</p><p style="margin:0;font-size:15px;line-height:1.6;color:#3b3b3b;">See who has been put forward for each role, with the evidence behind every recommendation.</p></td></tr>
<tr><td style="padding:14px 0;border-top:1px solid #eee6da;"><p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#dc4f33;">Sharing when you can interview</p><p style="margin:0;font-size:15px;line-height:1.6;color:#3b3b3b;">Give the times that work for you, so rounds get booked without the back and forth.</p></td></tr>
<tr><td style="padding:14px 0;border-top:1px solid #eee6da;border-bottom:1px solid #eee6da;"><p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#dc4f33;">Running the interview rounds</p><p style="margin:0;font-size:15px;line-height:1.6;color:#3b3b3b;">Follow where each candidate has got to, and record what you decided after each round.</p></td></tr>
</table>
<div style="text-align:center;margin:28px 0 16px;"><a href="${opts.url}" style="display:inline-block;background:#dc4f33;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 28px;border-radius:10px;">Accept the invitation</a></div>
<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 6px;">Please sign in with this email address. The invitation is tied to it, so it will not work from another account.</p>
<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 22px;">The link can be accepted once, and it expires on ${expiryLabel}, roughly ${INVITE_TTL_DAYS} days from now. If it has gone stale by the time you get to it, ask ${agency} to send a fresh one.</p>
<p style="font-size:13px;line-height:1.6;color:#8a8178;margin:0 0 22px;word-break:break-all;">If the button does not work, paste this into your browser:<br /><a href="${opts.url}" style="color:#b3341b;">${opts.url}</a></p>
<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 24px;">Not expecting this? You can ignore the email and nothing happens. No account is created until you accept.</p>
<p style="font-size:15px;color:#1e1813;margin:0;">&mdash; The Tailr team</p>
<p style="font-size:12px;color:#a8a29e;margin:28px 0 0;line-height:1.5;">You are receiving this because ${agency} added you as a client contact in Tailr. Reply to this email to reach them directly.</p>
</div></body></html>`
}
