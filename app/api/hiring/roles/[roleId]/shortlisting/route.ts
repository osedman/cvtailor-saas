/**
 * The shortlist while the recruiter is still building it, for the hiring
 * manager: names only, live from the recruiter's decisions. The tie check,
 * the right-to-represent and redaction rules, and the "added since the
 * submission" cut all live in lib/agency/client-shortlisting.ts. A role that
 * is not theirs is "not found", never "forbidden".
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { getShortlisting } from "@/lib/agency/client-shortlisting"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

const NO_STORE = { "Cache-Control": "private, no-store" }

function authFail(failure: HiringFailure) {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No hiring link" },
    { status: failure === "unauthenticated" ? 401 : 403, headers: NO_STORE }
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const shortlisting = await getShortlisting(auth.ctx, roleId)
    if (!shortlisting) return NextResponse.json({ error: "Role not found" }, { status: 404, headers: NO_STORE })
    return NextResponse.json(
      { entries: shortlisting.entries, submitted: shortlisting.submitted },
      { headers: NO_STORE }
    )
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500, headers: NO_STORE })
  }
}
