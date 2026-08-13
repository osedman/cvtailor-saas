/**
 * Hat resolution for the hiring-manager shell.
 *
 * GET → the caller's client-actor links, or a failure the shell can render.
 *
 * §5.4: one auth pool, three orthogonal hats. This route answers exactly one
 * question — "does the signed-in person hold a hiring-manager hat, and for
 * whom?" — and nothing about their consumer or recruiter hats. Holding no link
 * is the ordinary state of most users, not an error condition in the product
 * sense, but it IS an authorisation failure for this surface, so it answers
 * 403 with a message the shell can show verbatim.
 *
 * Hat detection is a service-role lookup inside requireHiringContext(): hiring
 * managers have zero RLS grants, so there is nothing for a user-scoped read to
 * find. No Supabase query lives in this file.
 */

import { NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"

export const maxDuration = 15

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

/**
 * Postgres errors quote the offending row value, which on these tables is
 * somebody's email address — so the database message never reaches the caller
 * or the log. The error's name and SQLSTATE code carry no PII and are enough
 * to find the fault.
 */
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

    return NextResponse.json({
      hiring: true,
      userId: auth.ctx.userId,
      // The caller's OWN session address, returned to the caller. Not a
      // disclosure — they are already authenticated as this mailbox.
      email: auth.ctx.email,
      links: auth.ctx.links,
    })
  } catch (error) {
    return serverError("me", error)
  }
}
