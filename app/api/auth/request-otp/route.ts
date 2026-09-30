import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"
import { b2bFrom } from "@/lib/email-senders"
import { EMAIL_SANS } from "@/lib/email-style"
import { checkRateLimit, anonRateLimitId, limitedResponse } from "@/lib/rate-limit"
// One definition of the open-redirect guard for the whole auth flow. It used
// to live here as a private copy; two copies of a security check is how one of
// them quietly drifts permissive.
import { safeNextPath } from "@/lib/hat-routing"
import { doorFromHost, getAppOrigin, getBusinessOrigin } from "@/lib/site-url"
import { withTiming } from "@/lib/server-timing"

/**
 * Send magic-link / OTP via Resend, bypassing Supabase Auth's SMTP mailer.
 *
 * Staging (and any project still on Resend's onboarding@resend.dev From) fails
 * client-side signInWithOtp with "Error sending magic link email" — Resend 550
 * only allows the account-owner inbox until a verified domain From is used.
 * Admin generateLink does not send mail; we deliver ourselves.
 */
async function POST_handler(request: Request) {
  let email = ""
  let next: string | null = null
  try {
    const body = (await request.json()) as { email?: string; next?: string }
    email = (body.email ?? "").trim().toLowerCase()
    next = safeNextPath(body.next)
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 })
  }

  // The door this sign-in came through — the two products have separate front
  // doors sharing this one engine, so the confirm link must return to the host
  // the person actually started on.
  const door = doorFromHost(request.headers.get("host"))

  // Unauthenticated endpoint that sends email — two limits, charged in order:
  //  1. Per target ADDRESS at "auth" (3/min, 15/day): what stops anyone
  //     email-bombing an inbox. Strict on purpose; one address, one person.
  //  2. Per caller NETWORK at "auth_net" (20/min, 200/day per door): a
  //     per-network flood ceiling, not the Resend account quota (see the
  //     preset). Until 28 Sep 2026 this was "auth" too, a number
  //     for one person, so the fourth colleague in one office asking for a
  //     code for their own address was refused with 429.
  // Both are keyed by door: one person is often both a consumer and a
  // recruiter, and their job-hunting must not throttle their day job.
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"
  const limited =
    (await checkRateLimit(anonRateLimitId(`email:${door}:${email}`), "auth")) ??
    (await checkRateLimit(anonRateLimitId(`ip:${door}:${ip}`), "auth_net"))
  if (limited) return limited

  // Origin header first (it already follows the calling host), then the
  // configured origin for this door. The previous last resort was a hardcoded
  // staging Vercel URL, which would have emailed a staging link from
  // production the moment a caller arrived without an Origin header.
  const origin =
    request.headers.get("origin") ||
    (door === "business" ? getBusinessOrigin() : getAppOrigin())
  const redirectTo = `${origin.replace(/\/$/, "")}/auth/confirm`

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    })

    if (error) {
      // Supabase's words are facts about the ACCOUNT — "Signups not allowed"
      // says an address has none, "User is banned" says one exists — and an
      // unauthenticated caller must not learn either, so they never leave the
      // server, and the log gets the code and status only (the message can
      // quote the address). One refusal is worth passing on, in our words:
      // Supabase's own per-account wait, which becomes the app's usual 429.
      const status = (error as { status?: number }).status
      const code = (error as { code?: string }).code
      console.error("[auth/request-otp] generateLink refused", { status, code })
      if (status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit") {
        const seconds = Number((error.message ?? "").match(/(\d+)\s*seconds?/i)?.[1])
        return limitedResponse(Number.isFinite(seconds) && seconds > 0 ? seconds : 60)
      }
      return NextResponse.json(
        { error: "We couldn't start sign-in for that address. Check it and try again." },
        { status: 400 },
      )
    }

    const props = data?.properties as
      | { hashed_token?: string; email_otp?: string }
      | undefined
    const tokenHash = props?.hashed_token
    const otp = props?.email_otp

    if (!tokenHash) {
      console.error("[auth/request-otp] generateLink missing hashed_token")
      return NextResponse.json({ error: "Could not start sign-in" }, { status: 500 })
    }

    const nextQs = next ? `&next=${encodeURIComponent(next)}` : ""
    const confirmUrl = `${redirectTo}?token_hash=${encodeURIComponent(tokenHash)}&type=email${nextQs}`
    const otpLine = otp
      ? `<p style="margin:20px 0 0;font-size:14px;color:#5c534c;">Or enter this code in the app: <strong style="letter-spacing:0.2em;font-family:ui-monospace,monospace;">${otp}</strong></p>`
      : ""

    const sent = await sendEmail({
      // The business door signs in from the agency domain once it is verified.
      from: door === "business" ? b2bFrom() : undefined,
      to: email,
      subject: "Sign in to Tailr",
      html: `<div style="font-family:${EMAIL_SANS};color:#1e1813;max-width:480px;margin:0 auto;padding:24px;">
  <h2 style="font-size:20px;margin:0 0 12px;">Sign in to Tailr</h2>
  <p style="font-size:15px;line-height:1.5;margin:0 0 20px;color:#5c534c;">Click the button below to continue. On your phone, open the link and tap Continue.</p>
  <p style="margin:0 0 8px;"><a href="${confirmUrl}" style="display:inline-block;background:#dc4f33;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;">Sign in to Tailr</a></p>
  ${otpLine}
  <p style="font-size:12px;color:#a8a29e;margin:28px 0 0;line-height:1.5;">This link and code each work once and expire in about an hour. If you did not request this, you can ignore this email.</p>
</div>`,
    })

    if (!sent.sent) {
      // Resend's text describes our mail setup and can quote an address; it
      // stays out of the reply and out of the log.
      console.error("[auth/request-otp] Resend did not send", { skipped: sent.skipped ?? null, failed: Boolean(sent.error) })
      return NextResponse.json(
        { error: "We couldn't send the sign-in email just now. Try again in a minute." },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    // Name and code only: an upstream message can quote the address.
    console.error("[auth/request-otp] failed", {
      name: e instanceof Error ? e.name : typeof e,
      code: (e as { code?: string })?.code,
    })
    return NextResponse.json({ error: "Error sending magic link email" }, { status: 500 })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const POST = withTiming("/api/auth/request-otp", "POST", POST_handler)
