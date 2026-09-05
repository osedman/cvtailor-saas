/**
 * Start connecting a calendar. Redirects to the provider's consent screen
 * with a signed state (user id + nonce, the nonce also in an httpOnly
 * cookie) and the path to come back to. Refuses plainly when the provider
 * or token storage is not configured.
 */

import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { requireHiringContext } from "@/lib/agency/client-auth"
import { PROVIDERS, isProvider } from "@/lib/calendar/providers"
import { tokenStorageConfigured } from "@/lib/calendar/tokens"
import { safeNextPath } from "@/lib/auth-paths"

export async function GET(req: NextRequest) {
  const auth = await requireHiringContext()
  if (!auth.ok) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const provider = req.nextUrl.searchParams.get("provider") ?? ""
  if (!isProvider(provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 400 })
  if (!tokenStorageConfigured()) return NextResponse.json({ error: "Calendar connections are not set up on this environment (CALENDAR_TOKEN_KEY)." }, { status: 503 })
  if (!PROVIDERS[provider].configured()) return NextResponse.json({ error: `${PROVIDERS[provider].label} is not set up on this environment.` }, { status: 503 })

  const nonce = randomBytes(16).toString("hex")
  const next = safeNextPath(req.nextUrl.searchParams.get("next")) ?? "/hiring"
  const state = Buffer.from(JSON.stringify({ u: auth.ctx.userId, n: nonce, next }), "utf8").toString("base64url")
  const res = NextResponse.redirect(PROVIDERS[provider].authorizeUrl(state))
  res.cookies.set("cal_nonce", nonce, { httpOnly: true, sameSite: "lax", secure: true, path: "/api/hiring/calendar", maxAge: 600 })
  return res
}
