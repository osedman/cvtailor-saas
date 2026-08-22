/**
 * Notification preferences: what reaches you, and what the agency's default is.
 *
 * GET   → this person's choices, the agency's defaults behind them, what
 *         actually happens today, and whether the caller may edit the defaults
 * PATCH → one switch at a time. `scope: "personal"` is anybody's own row;
 *         `scope: "agency"` is the default and is owners only.
 *
 * One route serves both screens, so the personal page and the defaults card on
 * agency settings cannot resolve preferences differently. The rules live in
 * lib/agency/notification-prefs beside the audit writes.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import {
  getNotificationPrefs,
  setAgencyDefault,
  setMyPreference,
} from "@/lib/agency/notification-prefs"
import { isSwitchableKind } from "@/lib/agency/notification-kinds"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 15

function authFail(f: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: f === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: f === "unauthenticated" ? 401 : 403 }
  )
}

export async function GET() {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    return NextResponse.json({ prefs: await getNotificationPrefs(auth.ctx) })
  } catch (e) {
    if (e instanceof AgencyAccessError) {
      return NextResponse.json({ error: e.message }, { status: 403 })
    }
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const kind = typeof body.kind === "string" ? body.kind : ""
    if (!isSwitchableKind(kind)) {
      // Named rather than ignored: an unknown kind silently accepted would
      // render as "saved" while changing nothing. brief_answered lands here,
      // which is the point — a recruiter cannot mute their client's reply.
      return NextResponse.json({ error: "That is not a switchable notification" }, { status: 400 })
    }

    const scope = body.scope === "agency" ? "agency" : "personal"

    if (scope === "agency") {
      if (typeof body.enabled !== "boolean") {
        return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 })
      }
      const prefs = await setAgencyDefault(auth.ctx, kind, body.enabled)
      return NextResponse.json({ prefs })
    }

    const value = body.value
    if (value !== "on" && value !== "off" && value !== "agency") {
      return NextResponse.json({ error: "value must be on, off or agency" }, { status: 400 })
    }
    const prefs = await setMyPreference(auth.ctx, kind, value)
    return NextResponse.json({ prefs })
  } catch (e) {
    if (e instanceof AgencyAccessError) {
      return NextResponse.json({ error: e.message }, { status: 403 })
    }
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 })
  }
}
