/**
 * Which agency am I working in, and let me change it.
 *
 * Most recruiters belong to one agency and will never see this. It exists
 * because anyone in two used to get the oldest one silently, with no way to
 * reach the other and nothing on screen admitting it existed.
 *
 * The cookie this sets is a PREFERENCE, not a permission. requireAgencyContext
 * re-validates it against real memberships on every request, so the worst a
 * forged value can do is be ignored. The POST still refuses unknown ids
 * outright rather than silently falling back, because a switch that quietly
 * does nothing is how someone ends up editing the wrong agency's role.
 */

import { NextRequest, NextResponse } from "next/server"
import { AGENCY_COOKIE, requireAgencyContext } from "@/lib/agency/db"

export const maxDuration = 10

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function GET() {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)

    return NextResponse.json({
      current: {
        agencyId: auth.ctx.agencyId,
        agencyName: auth.ctx.agencyName ?? "",
        role: auth.ctx.role,
      },
      memberships: auth.ctx.memberships ?? [],
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)

    const body = (await req.json().catch(() => ({}))) as { agencyId?: unknown }
    const wanted = typeof body.agencyId === "string" ? body.agencyId : ""
    if (!wanted) {
      return NextResponse.json({ error: "agencyId is required" }, { status: 400 })
    }

    // The membership list is the caller's own, resolved server-side. An id
    // outside it is refused — never silently ignored.
    const match = (auth.ctx.memberships ?? []).find((m) => m.agencyId === wanted)
    if (!match) {
      return NextResponse.json({ error: "You are not a member of that agency" }, { status: 403 })
    }

    const res = NextResponse.json({
      current: { agencyId: match.agencyId, agencyName: match.agencyName, role: match.role },
    })
    res.cookies.set(AGENCY_COOKIE, match.agencyId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    })
    return res
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
