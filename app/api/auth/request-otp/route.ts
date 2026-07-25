import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"

/**
 * Send magic-link / OTP via Resend, bypassing Supabase Auth's SMTP mailer.
 *
 * Staging (and any project still on Resend's onboarding@resend.dev From) fails
 * client-side signInWithOtp with "Error sending magic link email" — Resend 550
 * only allows the account-owner inbox until a verified domain From is used.
 * Admin generateLink does not send mail; we deliver ourselves.
 */
export async function POST(request: Request) {
  let email = ""
  try {
    const body = (await request.json()) as { email?: string }
    email = (body.email ?? "").trim().toLowerCase()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 })
  }

  const origin =
    request.headers.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://cvtailor-saas-git-staging-ooifoh-gmailcoms-projects.vercel.app"
  const redirectTo = `${origin.replace(/\/$/, "")}/auth/confirm`

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    })

    if (error) {
      console.error("[auth/request-otp] generateLink:", error.message)
      return NextResponse.json(
        { error: error.message || "Could not start sign-in" },
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

    const confirmUrl = `${redirectTo}?token_hash=${encodeURIComponent(tokenHash)}&type=email`
    const otpLine = otp
      ? `<p style="margin:20px 0 0;font-size:14px;color:#5c534c;">Or enter this code in the app: <strong style="letter-spacing:0.2em;font-family:ui-monospace,monospace;">${otp}</strong></p>`
      : ""

    const sent = await sendEmail({
      to: email,
      subject: "Sign in to Tailr",
      html: `<div style="font-family:Georgia,serif;color:#1e1813;max-width:480px;margin:0 auto;padding:24px;">
  <h2 style="font-size:20px;margin:0 0 12px;">Sign in to Tailr</h2>
  <p style="font-size:15px;line-height:1.5;margin:0 0 20px;color:#5c534c;">Click the button below to continue. On your phone, open the link and tap Continue.</p>
  <p style="margin:0 0 8px;"><a href="${confirmUrl}" style="display:inline-block;background:#dc4f33;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;">Sign in to Tailr</a></p>
  ${otpLine}
  <p style="font-size:12px;color:#a8a29e;margin:28px 0 0;line-height:1.5;">This link and code each work once and expire in about an hour. If you did not request this, you can ignore this email.</p>
</div>`,
    })

    if (!sent.sent) {
      console.error("[auth/request-otp] Resend:", sent.error || sent.skipped)
      return NextResponse.json(
        { error: sent.error || "Error sending magic link email" },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[auth/request-otp] failed:", e)
    return NextResponse.json({ error: "Error sending magic link email" }, { status: 500 })
  }
}
