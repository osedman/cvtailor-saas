/**
 * Accept a client invite — the route that turns a signed-in person into a
 * hiring manager for one agency contact.
 *
 * POST { token } → { ok: true, agencyName }
 *
 * Authenticated on purpose, and there is no anonymous variant. §5.4: linkage
 * is invite-only AND mailbox-proven. The token proves someone sent you a link;
 * the session proves you own the address it was sent to. acceptInvite()
 * enforces the second half (case-insensitive email match) and audits the
 * rejections — a failed claim against a live invite is precisely the event a
 * recruiter should be able to see afterwards.
 *
 * This route therefore does four things and no more: read the body, prove the
 * session, charge the rate limiters, hand the token to the server layer. The
 * binding itself — claim-then-bind, so two tabs cannot both win — lives in
 * lib/agency/client-auth.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { acceptInvite } from "@/lib/agency/client-auth"
import { checkDoorwayLimit, checkRateLimit } from "@/lib/rate-limit"
import { createClient } from "@/lib/supabase/server"

export const maxDuration = 15

export async function POST(req: NextRequest) {
  try {
    let token = ""
    try {
      const body = (await req.json()) as { token?: unknown }
      token = typeof body?.token === "string" ? body.token.trim() : ""
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    // The session is the mailbox proof. Read it before touching the token so
    // an anonymous caller never reaches the invite lookup at all.
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: "Sign in with the invited email address to accept this invitation." },
        { status: 401 }
      )
    }

    // Per signed-in user at the strict tier: a hijacked or throwaway account
    // must not be able to grind links. Then the doorway limit — a loose flood
    // ceiling per network plus a per-link limit (sha256 of the token) — which
    // replaces the old per-IP "auth" charge. That one allowed three accepts a
    // minute per network, so the fourth colleague in one office was refused
    // (28 Sep 2026) while guarding nothing: the token is 192 random bits, and
    // anyone cycling accounts to fish still meets the network ceiling.
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"
    const limited =
      (await checkRateLimit(user.id, "auth")) ??
      (await checkDoorwayLimit("hiring-accept", ip, token))
    if (limited) return limited

    if (!token) {
      return NextResponse.json({ error: "Invitation token required" }, { status: 400 })
    }

    const result = await acceptInvite(token, { id: user.id, email: user.email ?? "" })

    if (!result.ok) {
      // Both refusals are 403. The mismatch message is specific because the
      // person reading it is signed in and needs to know what to do next; it
      // still names neither address — the invited one is not theirs to see
      // here, and their own is already on screen in the app shell.
      const error =
        result.reason === "email_mismatch"
          ? "This invitation was issued to a different email address. Sign out and sign back in with that address to accept it."
          : "This invitation link is no longer valid."
      return NextResponse.json({ error, reason: result.reason }, { status: 403 })
    }

    return NextResponse.json({ ok: true, agencyName: result.agencyName })
  } catch (error) {
    // No database message to caller or log: Postgres quotes row values, and
    // the rows here hold email addresses.
    console.error("[hiring/accept] failed", {
      name: error instanceof Error ? error.name : typeof error,
      code: (error as { code?: string })?.code,
    })
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
