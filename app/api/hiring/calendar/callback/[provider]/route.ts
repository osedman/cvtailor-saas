/**
 * The provider sends the user back here with a code. Verify the state
 * against the nonce cookie and the signed-in user, exchange the code,
 * seal and store the tokens, and return to where they were.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import { PROVIDERS, isProvider } from "@/lib/calendar/providers"
import { saveConnection } from "@/lib/calendar/connections"
import { safeNextPath } from "@/lib/auth-paths"
import { getBusinessOrigin } from "@/lib/site-url"

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const origin = getBusinessOrigin()
  const fail = (reason: string, next = "/hiring") => NextResponse.redirect(`${origin}${next}?calendar=${encodeURIComponent(reason)}`)
  if (!isProvider(provider)) return fail("unknown-provider")

  const rawState = req.nextUrl.searchParams.get("state") ?? ""
  let state: { u?: string; n?: string; next?: string } = {}
  try {
    state = JSON.parse(Buffer.from(rawState, "base64url").toString("utf8"))
  } catch {
    return fail("bad-state")
  }
  const next = safeNextPath(state.next ?? null) ?? "/hiring"
  const nonce = req.cookies.get("cal_nonce")?.value
  if (!nonce || nonce !== state.n) return fail("bad-state", next)

  const auth = await requireHiringContext()
  if (!auth.ok || auth.ctx.userId !== state.u) return fail("not-signed-in", next)

  const code = req.nextUrl.searchParams.get("code")
  if (!code) return fail(req.nextUrl.searchParams.get("error") ?? "declined", next)

  try {
    const tokens = await PROVIDERS[provider].exchange(code)
    await saveConnection(auth.ctx.userId, provider, tokens)
  } catch {
    return fail("exchange-failed", next)
  }
  const res = NextResponse.redirect(`${origin}${next}?calendar=connected`)
  res.cookies.set("cal_nonce", "", { httpOnly: true, sameSite: "lax", secure: true, path: "/api/hiring/calendar", maxAge: 0 })
  return res
}
