/**
 * Client access: who, in the agency's address book, can actually sign in.
 *
 * GET returns one row per client contact with the state of their access
 * ('linked' | 'invited' | 'expired' | 'none'), which is what the recruiter's
 * client-access table renders and what the invite/link routes act on.
 *
 * The query itself lives in lib/agency/client-auth (service-role, scoped to
 * ctx.agencyId), because hiring managers hold no RLS grants and the tenancy
 * filter has to sit somewhere it can be reviewed. Route handlers never touch
 * Supabase directly.
 *
 * Rows carry the contact's email, exactly as /api/agency/contacts already
 * does: it is the agency's own address book. It must never reach a log line
 * or an audit entity_ref.
 */

import { NextResponse } from "next/server"
import { requireAgencyContext } from "@/lib/agency/db"
import { listClientAccess } from "@/lib/agency/client-auth"

export const maxDuration = 15

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

    // A read: viewers see this like everything else.
    const clients = await listClientAccess(auth.ctx)
    return NextResponse.json({ clients })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
