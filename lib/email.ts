import { appPath, getMarketingOrigin } from '@/lib/site-url'

/**
 * Minimal transactional email sender via Resend's HTTP API (no SDK dependency).
 *
 * Configure with env vars:
 *   RESEND_API_KEY   — required to actually send; if absent, send() is a no-op
 *   WELCOME_FROM     — From header, e.g. "Tailr <ose@lean-frame.com>"
 *                      (defaults to Resend's shared test sender until a domain
 *                      is verified)
 *
 * Returns { sent: boolean, skipped?, error? } and never throws, so callers can
 * fire-and-forget without risking the request they are attached to.
 */
export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  replyTo?: string
}): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: false, skipped: "RESEND_API_KEY not set" }

  const from = process.env.WELCOME_FROM || "Tailr <onboarding@resend.dev>"

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const body = await res.text()
      return { sent: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` }
    }
    return { sent: true }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Branded welcome email for a new Tailr signup. Dash-free prose, inline styles. */
export function welcomeEmailHtml(): string {
  const tailorUrl = appPath("/tailor")
  const marketingHost = getMarketingOrigin().replace(/^https?:\/\//, "")
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9f6f0;font-family:'Hanken Grotesk',-apple-system,Segoe UI,Arial,sans-serif;color:#1e1813;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
<div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#1e1813;">tailr<span style="color:#dc4f33;">.</span></div>
<h1 style="font-size:26px;line-height:1.25;font-weight:800;letter-spacing:-0.5px;margin:24px 0 8px;">Welcome to Tailr</h1>
<p style="font-size:16px;line-height:1.6;color:#595959;margin:0 0 24px;">Thanks for joining the beta. Tailr rewrites your CV for each job, scores the match against real evidence, preps you for the interview, and tracks every application, in about 30 seconds. Here is what you can do right now:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><td style="padding:14px 0;border-top:1px solid #eceae6;"><p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#dc4f33;">Tailor your CV to any job</p><p style="margin:0;font-size:15px;line-height:1.6;color:#3b3b3b;">Drop in your CV and the job description, then get an evidence-checked rewrite with a match score you can audit.</p></td></tr>
<tr><td style="padding:14px 0;border-top:1px solid #eceae6;"><p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#dc4f33;">Prep for the interview</p><p style="margin:0;font-size:15px;line-height:1.6;color:#3b3b3b;">Get the questions you are likely to face, with answer frameworks drawn from your own experience, plus one click company research.</p></td></tr>
<tr><td style="padding:14px 0;border-top:1px solid #eceae6;border-bottom:1px solid #eceae6;"><p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#dc4f33;">Track every application</p><p style="margin:0;font-size:15px;line-height:1.6;color:#3b3b3b;">Keep your search on one board, from saved to applied to interview to offer.</p></td></tr>
</table>
<div style="text-align:center;margin:28px 0;"><a href="${tailorUrl}" style="display:inline-block;background:#dc4f33;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 28px;border-radius:10px;">Tailor your first CV &rarr;</a></div>
<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 24px;">Everything is free while we are in beta. Just reply to this email if you have any questions or feedback, we read every one.</p>
<p style="font-size:15px;color:#1e1813;margin:0;">&mdash; The Tailr team</p>
<p style="font-size:12px;color:#a8a29e;margin:28px 0 0;line-height:1.5;">You are receiving this because you signed up for Tailr at ${marketingHost}. Reply with the word UNSUBSCRIBE and we will remove you.</p>
</div></body></html>`
}
