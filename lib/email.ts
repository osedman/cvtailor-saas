import { appPath, getMarketingOrigin, marketingPath } from '@/lib/site-url'

/**
 * Minimal transactional email sender via Resend's HTTP API (no SDK dependency).
 *
 * Configure with env vars:
 *   RESEND_API_KEY   — required to actually send; if absent, send() is a no-op
 *   WELCOME_FROM     — From header, e.g. "Tailr <hello@gettailr.com>"
 *                      (defaults to verified gettailr.com sender; Resend's
 *                      onboarding@resend.dev only delivers to the account owner)
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

  const from = process.env.WELCOME_FROM || "Tailr <hello@gettailr.com>"

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

/**
 * Win-back email for people who signed up but never tailored a CV.
 *
 * Written from what the data actually says (28 Jul 2026): of 16 never-tailored
 * users, only 3 have a login event and none returned twice. They did not try
 * Tailr and find it wanting — they never had a first session. So this is a
 * nudge past that, not a feature pitch: three steps, one action, and a real
 * question at the end, because with a list this small the replies are worth
 * more than the clicks.
 *
 * Brand voice, matching welcomeEmailHtml(): "we", signed by the team, dash-free
 * prose. Never Ose's first person.
 */
export function winBackEmailHtml(
  heroUrl = marketingPath("/email/match-preview.png"),
): string {
  const tailorUrl = appPath("/tailor")
  const marketingHost = getMarketingOrigin().replace(/^https?:\/\//, "")
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9f6f0;font-family:'Hanken Grotesk',-apple-system,Segoe UI,Arial,sans-serif;color:#1e1813;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
<div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#1e1813;">tailr<span style="color:#dc4f33;">.</span></div>
<h1 style="font-size:27px;line-height:1.22;font-weight:800;letter-spacing:-0.5px;margin:24px 0 10px;">Seven seconds is all your CV gets</h1>
<p style="font-size:16px;line-height:1.6;color:#595959;margin:0 0 20px;">That is roughly how long a recruiter spends before deciding, according to Ladders' eye tracking research. In seven seconds nobody finds the line that proves you can do the job. Tailr moves it to where they are already looking.</p>
<img src="${heroUrl}" alt="A Tailr match score of 82 percent, with each requirement traced to the line in the CV that evidences it, and one honest gap." width="520" style="width:100%;max-width:520px;height:auto;display:block;border:0;border-radius:14px;margin:0 0 10px;" />
<p style="font-size:13px;line-height:1.5;color:#8a8178;margin:0 0 24px;">A real run. Every requirement mapped to the evidence behind it, and the one gap named rather than papered over.</p>
<p style="font-size:16px;line-height:1.6;color:#595959;margin:0 0 20px;">You signed up but have not tailored a CV yet. It takes about 30 seconds: paste the job, add your CV once, and get the version written for that role, with a score you can argue with.</p>
<div style="text-align:center;margin:26px 0 14px;"><a href="${tailorUrl}" style="display:inline-block;background:#dc4f33;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 30px;border-radius:10px;">Tailor your first CV &rarr;</a></div>
<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 20px;">Nothing gets invented, by the way. Tailr reframes what you have actually done, and where the evidence is not there it says so, rather than writing a claim you would have to defend in the interview.</p>
<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 24px;">Free while we are in beta. If something stopped you last time, reply and tell us what it was. We read every one.</p>
<p style="font-size:15px;color:#1e1813;margin:0;">&mdash; The Tailr team</p>
<p style="font-size:12px;color:#a8a29e;margin:28px 0 0;line-height:1.5;">You are receiving this because you signed up for Tailr at ${marketingHost}. Reply with the word UNSUBSCRIBE and we will remove you.</p>
</div></body></html>`
}
