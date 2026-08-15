/**
 * The hiring manager's dashboard read.
 *
 * GET → { dashboard: HiringDashboard } for the caller's own linked contacts.
 *
 * Every filter that matters is applied inside getHiringDashboard(), against
 * contact ids that came from the session — never from a query parameter. This
 * route deliberately accepts NO input: there is no ?contactId, no ?agencyId
 * and no ?roleId to tamper with, because §5.4 gives hiring managers zero RLS
 * grants and the service role would happily honour a forged id.
 *
 * The disclosure rules (what a client may and may not see of the recruiter's
 * working material) live in lib/agency/client-auth.ts as a boxed comment above
 * getHiringDashboard. Read them there before widening anything.
 *
 * The interview loop is data-only today — nothing writes briefs, slots or
 * rounds yet, so empty arrays are the correct answer. The UI renders an honest
 * empty state; it must never substitute sample content.
 */

import { NextResponse } from "next/server"
import { getHiringDashboard, requireHiringContext } from "@/lib/agency/client-auth"
import { getHatsHeld } from "@/lib/hat-routing"
import type { HiringFailure } from "@/lib/agency/client-auth"

export const maxDuration = 30

function authFail(failure: HiringFailure) {
  if (failure === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }
  return NextResponse.json(
    {
      error: "No client access — ask your recruiter for an invite.",
      reason: "not_linked",
    },
    { status: 403 }
  )
}

/** See the note in app/api/hiring/me/route.ts: database messages can quote a
 * row value (an email address), so only the error name and SQLSTATE code are
 * logged and a generic message is returned. */
function serverError(tag: string, error: unknown) {
  console.error(`[hiring/${tag}] failed`, {
    name: error instanceof Error ? error.name : typeof error,
    code: (error as { code?: string })?.code,
  })
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
}

export async function GET() {
  try {
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)

    const dashboard = await getHiringDashboard(auth.ctx)
    // Whether this person ALSO holds the recruiter hat, so the shell can offer
    // a way back. Nothing about the agency's data — just which doors exist for
    // this account. Without it a multi-hat person has no route between the two
    // surfaces at all, which is how the recruiter dashboard came to be mistaken
    // for this one.
    const hats = await getHatsHeld(auth.ctx.userId)
    return NextResponse.json({ dashboard, alsoRecruiter: hats.recruiter })
  } catch (error) {
    return serverError("dashboard", error)
  }
}
